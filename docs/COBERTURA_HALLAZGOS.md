# Cobertura de hallazgos por pruebas

Qué test impide que vuelva cada error detectado en [AUDITORIA.md](AUDITORIA.md) (A/D) y en la revisión diferencial (DR). Actualizado el 2026-09-22. Si se agrega un hallazgo o se mueve un test, actualizar esta tabla.

Rutas: tests Python en `apps/api-python/tests/`; web en `apps/web/test/` y `apps/web/e2e/`. **Cubierto** = hay prueba automática en CI. **Parcial** = lo interno está probado; falta lo indicado. **Fuera de alcance** = funcionalidad o decisión pendiente, no un error testeable todavía.

| ID | Tema | Pruebas | Estado |
| --- | --- | --- | --- |
| A01 | Registro/login web↔API | `test_flows::test_registration_login_refresh_logout`, `test_doctor_requires_verification`; `test_hallazgos::test_registration_rejects_privileged_fields`; `auth-session.test.cjs`; e2e login | Cubierto |
| A02 | Rutas y contratos | `test_flows::test_doctor_configuration_and_public_contracts`; recorridos e2e | Cubierto |
| A03 | Escritura privilegiada en paciente | `test_patients.py` (13 tests); `test_hallazgos::test_registration_rejects_privileged_fields` | Cubierto |
| A04 | Solapamiento y re-reserva | `test_flows::test_booking_cancellation_and_rebooking`, `test_database_rejects_overlaps_even_when_service_is_bypassed`, `test_slot_duration_range_and_overrides`; `test_hallazgos::test_booking_rejects_overlap_offgrid_and_past`; `test_postgres::test_postgres_concurrent_booking_and_cancel_rebook` | Cubierto |
| A05 | Agenda y disponibilidad | `test_flows::test_extra_and_schedule_validity`, `test_invalid_settings`, `test_schedule_validation`; `test_hallazgos::test_availability_*`, `test_schedule_rejects_invalid_blocks`, `test_settings_reject_out_of_range_values`, `test_overrides_reject_invalid_values` | Cubierto |
| A06 | IDs y reembolso | `test_integrations::test_mp_adapter_keeps_preference_and_payment_identifiers_separate`; `test_flows::test_payment_approval_idempotency_late_payment_and_refund`, `test_checkout_failure_does_not_hold_slot` | Parcial: falta sandbox Mercado Pago |
| A07 | Máquina de estados de pagos | `test_integrations::test_webhook_authenticates_url_and_validates_amount`; `test_flows::test_expiration_releases_slot_and_late_payment_refunds`; `test_hallazgos::test_payment_with_wrong_currency_changes_nothing`, `test_expiration_marks_payment_expired`; `test_postgres::test_postgres_concurrent_webhook_is_idempotent` | Cubierto |
| A08 | State OAuth | `test_integrations::test_oauth_nonce_cookie_encryption_and_replay`, `test_calendar_denied_consent_consumes_state_and_redirects`; `test_google_auth.py`; `test_postgres::test_postgres_oauth_*` | Parcial: falta Google real |
| A09 | Notificaciones | `test_flows::test_notification_failure_is_not_sent_and_job_retries`; `test_integrations::test_notification_marks_sent_only_after_provider_acceptance`; `test_outbox.py`; `test_hallazgos::test_cancellation_notifies_patient_and_doctor` | Parcial: faltan Resend/Twilio reales; WhatsApp no implementado |
| A10 | Historia sin auditoría | `test_flows::test_medical_history_is_atomic_and_immutable`; `test_clinical_references::test_audit_failure_rolls_back_new_record_and_entry` | Parcial: registro de accesos denegados pendiente (roadmap) |
| A11 | Referencias clínicas | `test_clinical_references.py`; `test_postgres::test_postgres_clinical_*`; e2e de enmiendas | Cubierto |
| A12 | Sync de calendario e ICS | `test_integrations::test_calendar_sync_is_idempotent_and_cancel_deletes`; `test_flows::test_feed_rotation_and_patient_ics` | Parcial: falta Google real |
| A13 | Fallback demo | `api.test.cjs`, `auth-session.test.cjs` | Cubierto |
| D01 | Suspensión y sesiones | `test_suspension.py`; `test_postgres::test_postgres_suspension_*`, `test_postgres_refresh_is_single_use_under_concurrency` | Cubierto |
| D02 | Activación de médicos | `test_flows::test_doctor_requires_verification`; e2e cola de verificación | Parcial: no verifica que aparezca en la búsqueda |
| D03 | Firma Mercado Pago | `test_integrations::test_webhook_authenticates_url_and_validates_amount` | Cubierto |
| D04 | Envío real de notificaciones | ver A09 | Parcial |
| D05 | Tests ausentes | suite completa + CI ([CI.md](CI.md)) | Cubierto |
| D06 | Migraciones | `test_migrations.py` | Cubierto |
| D07 | Validación de entradas | ver A03 y A05; `test_patients::test_bad_request_body` | Cubierto |
| D08 | Simulaciones como reales | `api.test.cjs` | Cubierto |
| D09 | Adjuntos, PDF | — | Fuera de alcance: no implementado |
| D10 | Configuración sin validar | `test_config.py` | **Cubierto y corregido el 2026-09-22**: `APP_ENV` mal escrito se trataba como desarrollo (permitía seed demo); producción aceptaba `ENCRYPTION_KEY` inválida |
| D11 | CI y operación | CI activo | Parcial: faltan readiness, observabilidad y restore |
| D12 | Paginación y retención | — | Fuera de alcance: falta diseño |
| D13 | Documentación | — | No aplica |
| D14 | Datos clínicos estructurados | — | Fuera de alcance: decisión de producto |
| DR-01 | Cambio de episodio al enmendar | `test_clinical_references::test_amendment_cannot_change_or_remove_original_episode` | Cubierto |
| DR-02 | Turno cancelado/pendiente | `test_clinical_references::test_new_entry_rejects_ineligible_appointment_even_with_other_relationship`; `test_postgres::test_postgres_cancel_before_clinical_write_rechecks_status` | Cubierto |
| DR-03 | Reemplazo SQLite | `test_clinical_references::test_sqlite_replace_cannot_bypass_immutability`, `test_sqlite_rowid_replace_cannot_delete_original_even_without_recursive_triggers` | Cubierto |
