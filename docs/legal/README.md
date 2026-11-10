# Documentos legales — borradores

**Nada de esta carpeta está revisado por un abogado ni publicado en la web.** Son borradores escritos por una IA el 2026-11-10 para llegar a la consulta legal con un texto concreto en lugar de una hoja en blanco. [BETA.md](../BETA.md) (Fase 0) sigue vigente: lo legal lo resuelve un abogado.

| Archivo | Estado |
| --- | --- |
| [terminos-pacientes.md](terminos-pacientes.md) | Borrador |
| [terminos-medicos.md](terminos-medicos.md) | Borrador; incluye el acuerdo de tratamiento de datos entre el médico y MiTurno |
| [politica-de-privacidad.md](politica-de-privacidad.md) | Borrador |
| [consentimiento-datos-de-salud.md](consentimiento-datos-de-salud.md) | Borrador; no es el consentimiento informado médico |

## Normas consultadas

Texto oficial leído en argentina.gob.ar (Infoleg):

- **Ley 26.529** de derechos del paciente, historia clínica y consentimiento informado (texto actualizado por las leyes 26.742 y 26.812): arts. 2, 5, 7 y 12 a 21.
- **Ley 25.326** de protección de datos personales: arts. 2, 5 a 12, 14, 16, 21 y 25.
- **Decreto 393/2023**, reglamentario de la Ley 27.706 de historia clínica electrónica.

Conocidas por resúmenes de estudios jurídicos y medios, **sin haber leído el texto oficial**:

- **Disposición 954/2025** (botón de arrepentimiento y botón de baja; reemplaza las resoluciones 424/2020 y 316/2018) y su interpretativa **Disposición 3/2026**.
- **Decreto 1089/2012**, reglamentario de la Ley 26.529.

Citadas de memoria, sin verificar en esta sesión: Ley 24.240 de defensa del consumidor (arts. 34, 36, 37), Código Civil y Comercial (arts. 26, 984 a 989, 1100 a 1122), Ley 25.506 de firma digital, Ley 17.132 de ejercicio de la medicina, Resolución AAIP 47/2018 de medidas de seguridad.

Al 2026-11-10 la Ley 25.326 sigue vigente. Hay proyectos de reforma integral en el Congreso (entre otros 1751-D-2026 y 3397-D-2026); según las fuentes consultadas ninguno fue aprobado. Si se aprueba uno, estos textos cambian.

No se revisó normativa provincial ni la de colegios médicos. La matrícula y varias reglas de historia clínica dependen de cada provincia.

## Lo que hay que llevarle al abogado

1. **Quién es MiTurno legalmente.** Persona física o sociedad, CUIT, domicilio. Hoy no figura en ningún lado.
2. **Reparto de responsabilidades sobre la historia clínica.** El borrador pone al médico como responsable y depositario, y a MiTurno como prestador que trata datos por su cuenta (Ley 25.326, art. 25). Es la decisión que más pesa.
3. **Qué pasa con las historias cuando un médico se va.** El art. 25 de la Ley 25.326 manda destruir los datos al terminar el servicio; la Ley 26.529 manda guardarlos 10 años y el paciente tiene derecho a seguir leyéndolos.
4. **Servidores fuera de Argentina.** Transferencia internacional (Ley 25.326, art. 12). Define la región del hosting.
5. **Firma.** Si usuario y contraseña alcanzan como firma electrónica de los registros clínicos.
6. **Registro de Dominios de Interoperabilidad en Salud** (Decreto 393/2023, art. 1): si MiTurno debe inscribirse.
7. **Inscripción de bases ante la AAIP.**
8. **Menores y personas a cargo.** El borrador solo admite mayores de 18.
9. **Defensa del consumidor.** Botón de baja, botón de arrepentimiento y leyendas obligatorias del sitio; si los médicos cuentan como consumidores.
10. **Verificación de matrículas.** Hasta dónde llega el deber de MiTurno.
11. **Marca.** «MiTurno» o «MiTurnos» y registro en el INPI (ya estaba pendiente).

## Diferencias entre los borradores y el producto actual

Los términos no pueden prometer lo que el sistema no hace. Hoy no existe:

- **Copia de la historia clínica en PDF** ni exportación para el médico que se da de baja (ROADMAP: «Exportación PDF» pendiente).
- **Baja de cuenta** desde la aplicación, para pacientes o médicos. Tampoco el botón de baja en el sitio.
- **Textos publicados en la web.** La página `/legal` existe con un aviso de «en revisión legal»; faltan los textos aprobados.
- **Dirección de soporte.**
- **Campos estructurados de historia clínica** (el art. 15 de la Ley 26.529 lista asientos obligatorios; la plataforma ofrece título y texto libre).

Sí existe y los borradores lo reflejan: aceptación de términos y consentimiento para datos de salud con versión, fecha y auditoría, exigida también a las cuentas creadas con Google (2026-11-10); historia inmutable con enmiendas, registro de lecturas y escrituras, acceso del médico solo si tiene o tuvo un turno con el paciente, lectura del paciente, administrador sin acceso a historias, aprobación manual de médicos, suspensión con cierre de sesión, seña desactivada sin Mercado Pago.
