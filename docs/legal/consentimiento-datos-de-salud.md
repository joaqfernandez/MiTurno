# Consentimiento del paciente para el tratamiento de datos de salud

> **BORRADOR SIN REVISIÓN LEGAL — NO PUBLICAR.** Redactado por una IA el 2026-11-10. Un abogado matriculado debe revisarlo. Lo que está entre [CORCHETES] falta definir. Ver [README.md](README.md).

## Qué es este documento y qué no es

Es el permiso que el paciente le da a MiTurno y a sus profesionales para guardar y usar sus **datos de salud** en la plataforma. La Ley 25.326 exige que ese permiso sea libre, expreso e informado, y que conste por escrito o por un medio equivalente (art. 5); los datos de salud son sensibles y nadie puede ser obligado a darlos (arts. 2 y 7).

**No es el consentimiento informado médico.** El consentimiento para un estudio, un tratamiento o una intervención (Ley 26.529, arts. 5 a 10) lo pide cada profesional en la consulta y no pasa por MiTurno.

## Cuándo se pide

Propuesta: al crear la cuenta de paciente, en una casilla separada de la aceptación de los términos y sin marcar de antemano. Quien no lo acepta no puede crear la cuenta, porque sin esos datos el servicio no funciona. [REVISAR CON EL ABOGADO: si conviene pedirlo recién antes de la primera reserva, y si condicionar el servicio a este consentimiento es válido.]

Se guarda la fecha, la hora y la versión del texto aceptado.

## Texto que ve el paciente

> **Autorización para tratar mis datos de salud**
>
> Leí la [Política de Privacidad] y autorizo de forma expresa a MiTurno y a los profesionales de la salud con los que reserve turnos a tratar mis datos personales, incluidos mis datos de salud, para:
>
> - gestionar mis turnos;
> - que los profesionales que me atiendan registren y consulten mi historia clínica en la plataforma;
> - enviarme avisos sobre mis turnos por email.
>
> Entiendo que:
>
> - mis datos de salud son datos sensibles y no estoy obligado a darlos, pero sin ellos MiTurno no puede prestarme el servicio;
> - solo acceden a mi historia clínica los profesionales con los que tengo o tuve un turno, y yo;
> - soy titular de mi historia clínica, puedo leerla desde mi cuenta y pedir una copia;
> - el profesional es responsable de lo que registra y debe conservarlo al menos 10 años, aunque yo cierre mi cuenta;
> - mis datos se guardan en servidores de [PROVEEDOR], ubicados en [PAÍS];
> - puedo acceder a mis datos, pedir que se corrijan o eliminen y retirar esta autorización escribiendo a [EMAIL]. Retirarla no borra lo que la ley obliga a conservar ni afecta lo hecho hasta ese momento.
>
> ☐ **Autorizo el tratamiento de mis datos de salud en estos términos.**

## Texto corto para la casilla del registro

> ☐ Autorizo a MiTurno y a los profesionales con los que reserve a tratar mis datos de salud para gestionar mis turnos y mi historia clínica. [Ver detalle]

## Casillas separadas en el registro

Tres aceptaciones distintas, ninguna marcada de antemano:

1. ☐ Acepto los [Términos y condiciones] y la [Política de Privacidad]. (obligatoria)
2. ☐ Autorizo el tratamiento de mis datos de salud. (obligatoria para pacientes)
3. [SI HAY SERVIDORES FUERA DE ARGENTINA Y EL ABOGADO LO PIDE] ☐ Acepto que mis datos se guarden en servidores ubicados en [PAÍS].

Para los profesionales alcanza la primera, con sus propios términos.

## Pendiente de revisar con el abogado

- Si el consentimiento del paciente a MiTurno alcanza también para cada profesional, o si cada profesional debe pedir el suyo.
- Qué pasa con las cuentas creadas antes de que exista este texto (hoy solo hay datos ficticios; en producción todas deberían nacer con el consentimiento).
- Pacientes que ingresan con Google: resuelto el 2026-11-10. La cuenta se crea al volver de Google, pero no puede usar nada hasta aceptar en la pantalla «Antes de continuar».
- Menores y personas a cargo.
