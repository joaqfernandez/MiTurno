"""Google login is separate from Calendar consent. No tokens in redirect URLs."""
from datetime import timedelta
import secrets
from urllib.parse import urlencode, urlsplit
import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import select, delete, update, func
from sqlalchemy.exc import IntegrityError
from .auth import digest, issue_tokens
from .dependencies import current_user, session
from .models import OAuthRequest, User, Patient, now

router = APIRouter(prefix="/api/auth/google", tags=["Google login"])
COOKIE_PATH = "/api/auth/google"


class GoogleLogin:
    def __init__(self, settings, transport=None, keys=None):
        self.settings = settings
        self.client = httpx.Client(timeout=15, transport=transport)
        self.keys = keys or jwt.PyJWKClient("https://www.googleapis.com/oauth2/v3/certs", timeout=15)

    @property
    def redirect_uri(self):
        return self.settings.google_login_redirect_uri or f"{self.settings.api_url}/api/auth/google/callback"

    def auth_url(self, state, nonce):
        if not self.settings.google_client_id or not self.settings.google_client_secret:
            raise HTTPException(503, "El acceso con Google no está configurado")
        return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
            "client_id": self.settings.google_client_id, "redirect_uri": self.redirect_uri,
            "response_type": "code", "scope": "openid email profile", "state": state,
            "nonce": nonce, "prompt": "select_account"})

    def exchange(self, code, nonce):
        response = self.client.post("https://oauth2.googleapis.com/token", data={
            "grant_type": "authorization_code", "code": code, "redirect_uri": self.redirect_uri,
            "client_id": self.settings.google_client_id, "client_secret": self.settings.google_client_secret})
        response.raise_for_status()
        token = response.json()["id_token"]
        key = self.keys.get_signing_key_from_jwt(token).key
        claims = jwt.decode(token, key, algorithms=["RS256"], audience=self.settings.google_client_id,
                            issuer=["https://accounts.google.com", "accounts.google.com"],
                            options={"require": ["sub", "exp", "iat", "iss", "aud", "nonce", "email", "email_verified"]})
        if (claims["email_verified"] is not True or not isinstance(claims["nonce"], str)
                or not secrets.compare_digest(claims["nonce"], nonce)
                or not isinstance(claims["sub"], str) or not 0 < len(claims["sub"]) <= 255
                or ("azp" in claims and claims["azp"] != self.settings.google_client_id)
                or (isinstance(claims["aud"], list) and len(claims["aud"]) > 1 and "azp" not in claims)):
            raise ValueError("Identidad inválida")
        claims["email"] = str(TypeAdapter(EmailStr).validate_python(claims["email"])).lower()
        return claims


def cookie(response, purpose, value, settings, ttl):
    response.set_cookie(f"miturno_oauth_{purpose}", value, max_age=ttl, httponly=True,
                        secure=settings.environment == "production", samesite="lax", path=COOKIE_PATH)


def create_request(db, purpose, response, settings, user_id=None):
    raw, nonce = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    binding = raw if purpose == "session" else secrets.token_urlsafe(32)
    ttl = 60 if purpose == "session" else 600
    db.execute(delete(OAuthRequest).where(OAuthRequest.expiresAt <= now()))
    db.add(OAuthRequest(tokenHash=digest(raw), bindingHash=digest(binding), purpose=purpose,
                        userId=user_id, nonce=nonce, expiresAt=now() + timedelta(seconds=ttl)))
    cookie(response, purpose, binding, settings, ttl)
    db.flush()
    return raw, nonce


def consume_request(db, purpose, raw, binding):
    if not raw or not binding or len(raw) > 128 or len(binding) > 128:
        raise ValueError("Solicitud inválida")
    conditions = (OAuthRequest.tokenHash == digest(raw), OAuthRequest.bindingHash == digest(binding),
                  OAuthRequest.purpose == purpose, OAuthRequest.expiresAt > now())
    item = db.scalar(select(OAuthRequest).where(*conditions))
    if item is None:
        raise ValueError("Solicitud vencida o inválida")
    if db.execute(delete(OAuthRequest).where(*conditions), execution_options={"synchronize_session": False}).rowcount != 1:
        raise ValueError("Solicitud utilizada")
    return item


def resolve_user(db, claims, link_id):
    user = db.scalar(select(User).where(User.googleSubject == claims["sub"]).with_for_update())
    if user:
        if user.status != "ACTIVE" or (link_id and user.id != link_id):
            raise ValueError("Cuenta no disponible")
        return user
    existing = db.scalar(select(User).where(func.lower(User.email) == claims["email"]).with_for_update())
    if existing:
        if existing.id != link_id or existing.googleSubject or existing.status != "ACTIVE":
            raise HTTPException(409, "Vinculá tu cuenta con contraseña")
        result = db.execute(update(User).where(User.id == link_id, User.googleSubject.is_(None), User.status == "ACTIVE").values(googleSubject=claims["sub"]))
        if result.rowcount != 1:
            raise ValueError("Cuenta modificada")
        return existing
    if link_id:
        raise HTTPException(409, "Elegí el mismo email de tu cuenta")
    user = User(email=claims["email"], googleSubject=claims["sub"], roles=["PATIENT"], status="ACTIVE")
    db.add(user)
    db.flush()
    first = claims.get("given_name") or claims.get("name") or "Paciente"
    last = claims.get("family_name") or ""
    db.add(Patient(userId=user.id, firstName=str(first)[:100], lastName=str(last)[:100]))
    db.flush()
    return user


def begin(request, response, db, user_id=None):
    raw, nonce = create_request(db, "login", response, request.app.state.settings, user_id)
    return request.app.state.login_provider.auth_url(raw, nonce)


@router.get("/start")
def start(request: Request, db=Depends(session)):
    response = RedirectResponse("/", status_code=303)
    response.headers["location"] = begin(request, response, db)
    return response


@router.post("/link")
def link(request: Request, response: Response, principal=Depends(current_user), db=Depends(session)):
    return {"url": begin(request, response, db, principal.user.id)}


@router.get("/callback")
def callback(request: Request, code: str | None = None, state: str | None = None,
             error: str | None = None, db=Depends(session)):
    settings = request.app.state.settings
    response = RedirectResponse(f"{settings.web_url}/login?google=failed", status_code=303)
    response.headers["Referrer-Policy"] = "no-referrer"
    response.delete_cookie("miturno_oauth_login", path=COOKIE_PATH)
    try:
        pending = consume_request(db, "login", state, request.cookies.get("miturno_oauth_login"))
        if error or not code or len(code) > 4096:
            raise ValueError("Autorización denegada")
        claims = request.app.state.login_provider.exchange(code, pending.nonce)
        # Savepoint: consume state even if identity creation conflicts or provider fails.
        with db.begin_nested():
            user = resolve_user(db, claims, pending.userId)
            create_request(db, "session", response, settings, user.id)
        response.headers["location"] = f"{settings.web_url}/auth/google/callback"
    except HTTPException as exc:
        if exc.status_code == 409:
            response.headers["location"] = f"{settings.web_url}/login?google=account"
    except (ValueError, KeyError, TypeError, ValidationError, jwt.PyJWTError, httpx.HTTPError, IntegrityError):
        # Never put provider tokens, authorization codes or detailed errors in URLs/logs.
        pass
    return response


@router.post("/complete")
def complete(request: Request, db=Depends(session)):
    settings = request.app.state.settings
    parsed = urlsplit(settings.web_url)
    if request.headers.get("origin") != f"{parsed.scheme}://{parsed.netloc}":
        raise HTTPException(403, "Origen no permitido")
    response = JSONResponse({"message": "Sesión vencida o inválida"}, status_code=401)
    response.delete_cookie("miturno_oauth_session", path=COOKIE_PATH)
    try:
        raw = request.cookies.get("miturno_oauth_session")
        pending = consume_request(db, "session", raw, raw)
        user = db.scalar(select(User).where(User.id == pending.userId).with_for_update())
        if user is None or user.status != "ACTIVE":
            return response
        response = JSONResponse(issue_tokens(db, user, settings))
        response.delete_cookie("miturno_oauth_session", path=COOKIE_PATH)
    except ValueError:
        pass
    return response
