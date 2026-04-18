Aquí tienes el informe actualizado con la arquitectura real del código actual (Strands, qwen2.5, lifespan, historial, tools, etc.):

Informe Técnico — Proyecto Nerdbot v2.0
Ollama + Strands Agents + FastAPI
Última actualización: Abril 2026

1. Arquitectura General
El proyecto sigue una arquitectura Cliente-Servidor desacoplada, donde el frontend se comunica con el backend exclusivamente via API REST. El backend actúa como orquestador entre la interfaz de usuario y el motor de inferencia local.
[Next.js / React]  ←→  [FastAPI + Strands]  ←→  [Ollama local]
   Puerto 3000              Puerto 8000           Puerto 11434
Stack tecnológico
CapaTecnologíaJustificaciónFrontendNext.js + TypeScript + TailwindTipado estricto, estado reactivo, SPA sin configuración complejaBackendPython + FastAPIAsync nativo, validación automática con Pydantic v2, Swagger incluidoOrquestación LLMStrands Agents SDKAbstrae el agentic loop, gestiona tools y system prompt de forma nativaMotor de inferenciaOllama localPrivacidad total, sin costo por token, funciona offlineModelo IAqwen2.5:3bMejor soporte de español que phi3, misma eficiencia en GTX 1650 (4GB VRAM)PersistenciaJSONL planoFormato estándar de fine-tuning compatible con HuggingFace y Ollama

2. Componentes del Backend
2.1 Inicialización con Lifespan
El backend usa el patrón @asynccontextmanager lifespan de FastAPI para cargar el OllamaModel una sola vez al arrancar el servidor, almacenándolo en EstadoApp. Esto evita el costo de instanciar el modelo en cada request, que en hardware limitado sería inaceptable.
pythonestado.modelo_ollama = OllamaModel(
    host=URL_OLLAMA,
    model_id=MODELO_IA,
    params={"options": {"num_predict": 220, "temperature": 0.3}},
)
temperature: 0.3 fue elegido deliberadamente para qwen2.5: produce respuestas más deterministas, con mejor ortografía y menos alucinaciones que valores más altos. Con phi3 se necesitaba 0.5+ para que las respuestas no sonaran robóticas.
2.2 Dependency Injection — Agent por Request
El Agent de Strands se crea uno nuevo por cada request mediante Depends(obtener_agente). Esto garantiza aislamiento de sesión: el historial conversacional de un usuario nunca se filtra a otro.
El OllamaModel (pesado, inicializado una vez) se reutiliza. El Agent (liviano) se recrea. Es el balance correcto entre rendimiento y seguridad.
Además, la fecha y hora actual se inyectan dinámicamente en el system prompt en cada request, evitando que el modelo alucine el año o la hora:
pythonfecha_hoy = f"{ahora_local.strftime('%d de %B de %Y')} a las {ahora_local.strftime('%H:%M')} hs"
prompt_dinamico = SYSTEM_PROMPT.format(fecha_actual=fecha_hoy)
2.3 System Prompt
El prompt fue rediseñado para qwen2.5, priorizando naturalidad sobre restricciones. Los principios son tres en orden de prioridad: amabilidad primero, precisión segundo, brevedad tercera. El uso del voseo rioplatense se especifica explícitamente porque qwen2.5 tiende a usar tuteo neutro por defecto.
A diferencia de la versión anterior con phi3, el prompt actual es más corto y no requiere secciones ## ni listas de prohibiciones extensas. qwen2.5 sigue instrucciones simples con mayor fidelidad.
2.4 Herramientas del Agente (Tools)
El agente dispone de dos tools que puede invocar automáticamente según el contexto, sin que el usuario lo solicite explícitamente:
obtener_fecha_hora — Retorna la fecha y hora en zona horaria de Chile (America/Santiago via zoneinfo). Se implementó porque qwen2.5:3b, al ser un modelo pequeño sin acceso a internet, tiende a alucinar fechas cuando se le pregunta directamente sin una herramienta real.
buscar_en_entrenamiento — Busca coincidencias en el archivo JSONL por término. Permite al agente contextualizar respuestas con ejemplos previos guardados por el usuario. Retorna hasta 3 resultados relevantes.
2.5 Historial Conversacional
La versión anterior trataba cada request como one-shot sin memoria. La versión actual acepta un array historial desde el frontend, convirtiendo los turnos previos al formato nativo de Strands antes de llamar al agente:
pythonagente.messages = _construir_mensajes_historial(solicitud.historial)
Se limita a los últimos MAX_HISTORIAL = 10 turnos para no saturar la ventana de contexto del modelo en hardware con VRAM limitada.
2.6 Sanitización de Respuestas
Con qwen2.5 los filtros agresivos de la versión phi3 se eliminaron porque cortaban texto legítimo. Solo se mantienen dos patrones conservadores:

Eliminación de separadores --- seguidos de contenido meta
Eliminación de cabeceras tipo ## Instrucción, ## ROL que el modelo podría repetir ocasionalmente

Si la sanitización deja el texto vacío, se retorna un fallback: "¡Hola! ¿En qué puedo ayudarte hoy?".
2.7 Async Correcto con run_in_executor
Strands Agent es síncrono internamente. Llamarlo directamente en un endpoint async bloquearía el event loop de FastAPI. La solución es delegarlo a un hilo separado:
pythonresultado = await loop.run_in_executor(
    None,
    partial(agente, solicitud.mensaje),
)
Esto libera el event loop para otras requests mientras el modelo genera la respuesta.

3. Persistencia
Los datos de entrenamiento se guardan en formato JSONL (JSON Lines): cada línea es un objeto JSON válido con campos pregunta, respuesta, modelo, notas y fecha. Es el formato estándar que esperan HuggingFace, Ollama y herramientas de fine-tuning de OpenAI.
Cada ejemplo guardado representa un par oro (gold standard): pregunta real del usuario + respuesta corregida o aprobada por el clínico o usuario experto. El objetivo es acumular ejemplos para un futuro fine-tuning del modelo base.

4. Alcances

Chat offline con contexto conversacional — Mantiene historial de los últimos 10 turnos sin depender de ningún servicio externo.
Agente con herramientas reales — Puede consultar la hora real y buscar en la base de conocimiento propia sin que el usuario lo solicite explícitamente.
Curación de dataset integrada — El usuario puede aprobar, editar y guardar respuestas directamente desde el chat, generando ejemplos de entrenamiento de calidad sin fricción.
Sanitización automática — Filtra artefactos de modelos pequeños antes de mostrar la respuesta al usuario.
Arquitectura desacoplada — Frontend y backend son independientes. Se puede reemplazar el frontend por una app móvil sin tocar el código Python.


5. Límites Conocidos

Concurrencia limitada por hardware — La GTX 1650 (4GB VRAM) no soporta múltiples requests /chat simultáneas sin degradación. El modelo ocupa toda la VRAM disponible durante la inferencia.
Persistencia sin bloqueos de escritura — El archivo JSONL no tiene mecanismos de concurrencia. Si múltiples requests intentan escribir simultáneamente, puede haber corrupción de datos. En uso single-user esto no es un problema.
Eliminación O(n) — El endpoint DELETE /eliminar-dato/{indice} carga todo el archivo en memoria para reescribirlo. Con miles de registros esto se vuelve lento. Para escala mayor se requeriría una base de datos real (SQLite como mínimo).
Modelo sin conocimiento actualizado — qwen2.5:3b tiene fecha de corte de conocimiento. Para preguntas sobre eventos recientes, el tool obtener_fecha_hora mitiga parcialmente el problema pero no lo resuelve para contenido general.
Historial stateless a nivel API — El historial se mantiene en el frontend y se envía en cada request. Si el usuario recarga la página, el contexto conversacional se pierde. No hay sesiones persistentes en el servidor.
Variables de entorno parciales — URL_OLLAMA y MODELO_IA leen de variables de entorno con os.getenv, pero otros valores siguen hardcodeados. Para despliegue en red (no solo localhost) se requiere un .env completo.