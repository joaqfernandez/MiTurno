# Política de privacidad

> **BORRADOR SIN REVISIÓN LEGAL — NO PUBLICAR.** Redactado por una IA el 2026-11-10 a partir de la Ley 25.326 y de los datos que el producto guarda hoy. Un abogado matriculado debe revisarlo. Lo que está entre [CORCHETES] falta definir. Ver [README.md](README.md).

Versión [1.0] — vigente desde [FECHA].

## 1. Quién es responsable de tus datos

[RAZÓN SOCIAL O NOMBRE Y APELLIDO DEL TITULAR], CUIT [NÚMERO], con domicilio en [DOMICILIO LEGAL], Argentina («MiTurno»). Contacto para todo lo relacionado con tus datos: [EMAIL DE PRIVACIDAD O SOPORTE].

Hay una excepción: **de tu historia clínica es responsable el profesional que te atiende.** MiTurno le provee el sistema y trata esos datos por su cuenta (Ley 25.326, art. 25). [REVISAR CON EL ABOGADO: este reparto es el punto 2 del README.]

## 2. Qué datos guardamos

**Si sos paciente**

| Dato | Cuándo | Obligatorio |
| --- | --- | --- |
| Nombre, apellido, email | Al registrarte | Sí |
| Teléfono | Al registrarte | Sí |
| Contraseña | Al registrarte | Sí, salvo que ingreses con Google. Se guarda transformada: nadie puede leerla |
| DNI, fecha de nacimiento, obra social y número de afiliado | Si los cargás en tu perfil | No |
| Turnos: profesional, fecha, estado y el motivo de consulta que escribas | Al reservar | El motivo es opcional |
| Historia clínica | La escribe el profesional que te atiende | — |

**Si sos profesional**

Nombre, apellido, email, matrícula, especialidades, biografía, foto, lugares y horarios de atención, y tu configuración de agenda. Tu nombre, especialidades, foto, biografía, lugares de atención y horarios disponibles son **públicos**: los ve cualquier persona que entre al sitio.

**De todos**

- **Registros técnicos:** la dirección IP, la fecha y la página pedida en cada visita. No incluyen datos clínicos ni lo que escribís. Sirven para la seguridad del servicio y para limitar pedidos abusivos. Se conservan [PLAZO A DEFINIR CON EL ABOGADO].
- **Registro de auditoría:** quién leyó o escribió una historia clínica, cuándo y desde qué IP; y cambios de contraseña y de estado de las cuentas. No se puede modificar.
- **Emails enviados:** qué aviso se te mandó y si salió bien.

**Si ingresás con Google**, recibimos de Google tu email, tu nombre y un identificador de tu cuenta. No recibimos tu contraseña de Google.

**Datos que no guardamos:** datos de tarjetas (los pagos, cuando existan, se hacen en Mercado Pago), ubicación, ni contactos de tu teléfono.

## 3. Para qué los usamos

- Crear y proteger tu cuenta.
- Gestionar turnos y avisarte por email cuando se confirman, se cancelan o están por llegar.
- Que el profesional que te atiende pueda registrar y consultar tu historia clínica.
- Que el profesional pueda contactarte por un turno.
- Cuidar la seguridad del servicio y cumplir obligaciones legales.
- Obtener estadísticas internas con totales (por ejemplo, cantidad de turnos por especialidad o pacientes por franja de edad). Esas estadísticas no identifican a ninguna persona.

**No usamos tus datos para publicidad, no los vendemos y no armamos perfiles comerciales.**

## 4. Datos de salud

Los datos de salud son datos sensibles (Ley 25.326, art. 2). Nadie está obligado a darlos (art. 7). Los tratan los profesionales de la salud que te atienden, bajo secreto profesional (art. 8), y solo con tu consentimiento expreso (ver [consentimiento](consentimiento-datos-de-salud.md)).

- Solo acceden a tu historia los profesionales con los que tenés o tuviste un turno, y vos.
- El administrador de MiTurno no puede leer historias clínicas desde la aplicación.
- El motivo de consulta que escribís al reservar lo ve el profesional de ese turno. [REVISAR: hoy también queda guardado junto al turno; evaluar si se trata como dato de salud.]

## 5. Con quién los compartimos

Con nadie, salvo:

- **El profesional con el que reservás:** ve tu nombre, tu teléfono, tus turnos con él y tu historia clínica.
- **Proveedores que hacen funcionar el servicio**, que solo pueden usar los datos para eso:

| Proveedor | Para qué | Qué recibe | País |
| --- | --- | --- | --- |
| [HOSTING] | Alojar la aplicación | Todo lo que guarda MiTurno | [PAÍS] |
| [BASE DE DATOS] | Guardar los datos y sus copias de seguridad | Todo lo que guarda MiTurno | [PAÍS] |
| Resend | Enviar emails | Tu email y el texto del aviso (profesional, fecha y hora del turno) | [PAÍS] |
| Cloudflare | Dominio y protección de la red | Tu IP y las páginas que visitás | [PAÍS] |
| Google | Ingreso con Google; calendario del profesional si lo conecta; mapa del consultorio | Lo indicado en el punto 2; tu nombre y el horario del turno en el calendario del profesional que lo conecte; tu IP al ver el mapa | [PAÍS] |
| Mercado Pago | Señas, cuando estén habilitadas | Tu email y el importe | Argentina |

- **Autoridades**, cuando una ley o un juez lo ordenan.

[REVISAR CON EL ABOGADO: los proveedores fuera de Argentina implican transferencia internacional (Ley 25.326, art. 12). Definir base legal: consentimiento expreso en el registro, país con nivel adecuado o cláusulas contractuales.]

## 6. Cuánto tiempo los guardamos

- **Cuenta y turnos:** mientras tengas la cuenta. Si la das de baja, se eliminan o se vuelven anónimos dentro de [PLAZO], salvo lo que una ley obligue a conservar.
- **Historia clínica:** como mínimo 10 años desde la última atención registrada (Ley 26.529, art. 18), aunque cierres tu cuenta.
- **Registro de auditoría:** [PLAZO; al menos el mismo que la historia clínica].
- **Registros técnicos:** [PLAZO].
- **Copias de seguridad:** [PLAZO].

## 7. Cómo los protegemos

- La conexión con el sitio es cifrada (HTTPS).
- Las contraseñas se guardan transformadas con un algoritmo que impide leerlas.
- Los links para confirmar el email o cambiar la contraseña sirven una sola vez y vencen.
- Cada persona ve solo lo que le corresponde, y eso se controla en el servidor, no en el navegador.
- La historia clínica y el registro de auditoría no se pueden modificar ni borrar.
- Los registros técnicos y los mensajes de error no contienen datos personales ni clínicos, salvo la IP.
- Copias de seguridad [FRECUENCIA] con restauración probada. [COMPLETAR CUANDO EXISTA EL HOSTING; hoy no hay backups porque no hay producción.]

Ningún sistema es infalible. Si detectamos un acceso no autorizado a tus datos, te avisamos [PLAZO Y FORMA A DEFINIR CON EL ABOGADO].

## 8. Qué guarda tu navegador

MiTurno no usa cookies de publicidad ni de seguimiento, ni herramientas de analítica de terceros.

- Tu sesión se guarda en el almacenamiento local de tu navegador mientras estés conectado. Se borra al salir.
- Si ingresás con Google o conectás un calendario, usamos una cookie técnica que dura unos minutos para completar ese paso de forma segura.

## 9. Tus derechos

Podés, sin costo:

- **Acceder** a tus datos. Respondemos dentro de los 10 días corridos (Ley 25.326, art. 14).
- **Pedir que se corrijan, actualicen o eliminen.** Respondemos dentro de los 5 días hábiles (art. 16). La eliminación no alcanza a lo que la ley obliga a conservar.
- **Retirar tu consentimiento** y darte de baja.
- **Leer tu historia clínica** desde tu cuenta y pedirle una copia al profesional (Ley 26.529, art. 14).

Escribinos a [EMAIL] desde el email de tu cuenta. Podemos pedirte algún dato para confirmar que sos vos.

El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto, conforme lo establecido en el artículo 14, inciso 3 de la Ley Nº 25.326.

La Agencia de Acceso a la Información Pública, en su carácter de Órgano de Control de la Ley Nº 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.

[REVISAR CON EL ABOGADO: texto exacto y vigente de las dos leyendas anteriores, que se citaron de memoria.]

## 10. Menores de edad

MiTurno está pensado para mayores de 18 años. Si detectamos una cuenta de un menor creada sin su representante, la damos de baja. [REVISAR CON EL ABOGADO junto con el punto 4 de los términos para pacientes.]

## 11. Cambios en esta política

Si cambiamos esta política te avisamos por email y en el sitio con al menos [30] días de anticipación. Si el cambio amplía el uso de tus datos, te pedimos un nuevo consentimiento.
