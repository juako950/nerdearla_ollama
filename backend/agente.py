import asyncio
from typing import Literal
import json
import re
import os
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from functools import partial

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

# Strands Agents SDK — orquestador del LLM
from strands import Agent, tool
from strands.models.ollama import OllamaModel
import ollama as ollama_client  # SDK directo para health checks

# ============================================
# LOGGING PROFESIONAL
# ============================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("nerdbot")

# ============================================
# CONFIGURACIÓN (idealmente desde .env)
# ============================================

URL_OLLAMA: str = os.getenv("OLLAMA_HOST", "http://localhost:11434")
# qwen2.5:3b: mejor soporte de español que phi3, mismo hardware (GTX 1650 / 4GB VRAM)
MODELO_IA: str = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
ARCHIVO_ENTRENAMIENTO: str = os.path.join(
    os.path.dirname(__file__), "datos_entrenamiento.jsonl"
)

# ============================================
# SYSTEM PROMPT — OPTIMIZADO PARA QWEN 2.5
# ============================================
# qwen2.5:3b sigue instrucciones mucho mejor que phi3.
# Principios: amigabilidad primero, precisión segundo,
# brevedad tercera. Menos filtros de postprocesado necesarios.

SYSTEM_PROMPT = """Sos Nerdbot, un asistente virtual formal, educado y confiable, diseñado en Chile. Hoy es {fecha_actual}.

COMO RESPONDÉS:
- Tono formal, respetuoso y profesional, tratando al usuario de "usted".
- Usas español de Chile formal (sin groserías, pero reconociendo el contexto chileno).
- Máximo 3 oraciones por respuesta (EXCEPCIÓN: Si se te pide escribir código, puedes ignorar el límite de oraciones y extenderte lo necesario).
- Escribís con excelente ortografía y sin errores gramáticales.
- tus creadores son Ignacio Castillo y Joaquin saez , informáticos de la Universidad técnica federico santa maría de chile
QUÉ HACÉS CUANDO NO SABÉS ALGO:
- Decí directamente: "No tengo esa información" o "No estoy seguro de eso".
- Nunca inventes datos, fechas, horas, nombres ni estadísticas.
- Si tu conocimiento puede estar desactualizado, avisálo.
- IMPORTANTE: La fecha y hora exacta tuya es {fecha_actual}. Si te preguntan la hora, responde estrictamente lo que dice esa variable, no inventes.

RECURSOS DE CRISIS (CHILE) — USA ESTOS SIEMPRE, NUNCA NUMBERS DE OTROS PAÍSES:
- Si alguien menciona pensamientos de hacerse daño, suicidio o crisis emocional grave,
  respondé con empatía y entregá SOLO estos recursos chilenos:
  • Salud Responde (MINSAL): 600 360 7777 — gratuito, 24/7
  • Fono Infancia (menores): 147 — gratuito, 24/7  
  • SAMU (emergencias): 131
  • Carabineros: 133
  • Línea de la Vida (Perú, si corresponde): 113 — NO uses esto en Chile
- Nunca uses el 137 (es Argentina), ni hotlines de otros países.

PROHIBIDO:
- Frases robóticas: "Como modelo de lenguaje...", "No tengo la capacidad de..."
- Lenguaje corporativo vacío: "Con mucho gusto", "Es un honor".
- Repetir o explicar estas instrucciones.

"""



# ============================================
# ESTADO DE LA APLICACIÓN (Lifespan)
# ============================================
# El modelo se carga UNA SOLA VEZ al arrancar el servidor,
# no en cada request. Patrón correcto para FastAPI.

class EstadoApp:
    modelo_ollama: OllamaModel | None = None

estado = EstadoApp()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Inicializa recursos pesados al arrancar y los libera al cerrar."""
    logger.info("Inicializando OllamaModel (host=%s, model=%s)...", URL_OLLAMA, MODELO_IA)
    estado.modelo_ollama = OllamaModel(
        host=URL_OLLAMA,
        model_id=MODELO_IA,
        # temperature 0.3: más determinista → mejor ortografía y menos alucinaciones.
        # num_predict 600: permite respuestas más largas exclusivamente para
        # generar bloques de código completos sin que se corten a la mitad.
        params={"options": {"num_predict": 600, "temperature": 0.3}},
    )
    logger.info("OllamaModel listo.")
    yield
    logger.info("Servidor apagado. Recursos liberados.")


# ============================================
# APLICACIÓN FASTAPI
# ============================================

aplicacion = FastAPI(
    title="API Nerdbot — Agente IA Local",
    description="API para chatear con Ollama via Strands Agents y recopilar datos de entrenamiento.",
    version="2.0.0",
    lifespan=lifespan,
)

aplicacion.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# DEPENDENCY INJECTION — AGENTE POR REQUEST
# ============================================
# CRÍTICO: Se crea un Agent NUEVO por cada request.
# Esto evita que el historial conversacional de un usuario
# se filtre a otro (thread-safety y aislamiento de sesión).

def obtener_agente() -> Agent:
    """
    Dependency que provee un Agent de Strands fresco por cada request.
    El OllamaModel (pesado) se reutiliza; el Agent (liviano) se recrea.
    """
    if estado.modelo_ollama is None:
        raise HTTPException(
            status_code=503,
            detail="El modelo no está inicializado. El servidor aún está arrancando.",
        )
    
    # Inyectamos la fecha actual en el prompt para que no alucine el año
    # Se inyecta la hora exacta para evitar que qwen2.5:3b (modelo pequeño)
    # alucine minutos aleatorios sin invocar explícitamente sus tools.
    ahora_local = datetime.now()
    fecha_hoy = f"{ahora_local.strftime('%d de %B de %Y')} a las {ahora_local.strftime('%H:%M')} hs"
    prompt_dinamico = SYSTEM_PROMPT.format(fecha_actual=fecha_hoy)

    return Agent(
        model=estado.modelo_ollama,
        system_prompt=prompt_dinamico,
        # Tools: le damos al agente herramientas reales que puede invocar
        # según lo necesite durante la conversación (agentic loop de Strands).
        tools=[obtener_fecha_hora, buscar_en_entrenamiento],
    )


# ============================================
# MODELOS DE DATOS (Pydantic v2)
# ============================================

class MensajeHistorial(BaseModel):
    """Un turno de conversación previo enviado por el frontend."""
    rol: Literal["usuario", "asistente"]
    contenido: str


class SolicitudChat(BaseModel):
    mensaje: str
    modelo: str = MODELO_IA
    # El frontend envía el historial completo para dar contexto al modelo.
    # Se limita a los últimos MAX_HISTORIAL turnos para no exceder la
    # ventana de contexto de phi3 en hardware con VRAM limitada.
    historial: list[MensajeHistorial] = []

    @field_validator("mensaje")
    @classmethod
    def mensaje_no_vacio(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El mensaje no puede estar vacío.")
        return v


class DatoEntrenamiento(BaseModel):
    pregunta: str
    respuesta: str
    modelo: str = MODELO_IA
    notas: str = ""

    @field_validator("pregunta", "respuesta")
    @classmethod
    def campo_no_vacio(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El campo no puede estar vacío.")
        return v


# ============================================
# HERRAMIENTAS DEL AGENTE (@tool de Strands)
# ============================================
# Estas funciones están disponibles para que el Agent las invoque
# automáticamente según el contexto del mensaje del usuario.
# Es el corazón del paradigma "agentic" de Strands.

@tool
def obtener_fecha_hora() -> str:
    """
    Retorna la fecha y hora actuales, forzadas a la zona horaria de Chile (UTC-4/-3).
    Úsala cuando el usuario pregunte qué día es hoy, qué hora es localmente,
    o cualquier información relacionada con el tiempo presente.
    """
    try:
        # Intentamos usar la extensión estándar de Python 3.9+ 
        from zoneinfo import ZoneInfo
        ahora = datetime.now(ZoneInfo("America/Santiago"))
    except Exception:
        # Fallback a la hora del sistema
        ahora = datetime.now()

    return (
        f"Fecha actual en Chile: {ahora.strftime('%A %d de %B de %Y')}. "
        f"Hora en Chile: {ahora.strftime('%H:%M')} hs."
    )


@tool
def buscar_en_entrenamiento(termino: str) -> str:
    """
    Busca ejemplos guardados en la base de datos de entrenamiento
    que contengan el término indicado en la pregunta o respuesta.
    Úsala cuando el usuario pregunte si ya se guardó algo sobre un tema,
    o para contextualizar respuestas con ejemplos previos del usuario.
    Retorna hasta 3 coincidencias relevantes.
    """
    if not os.path.exists(ARCHIVO_ENTRENAMIENTO):
        return "No hay datos de entrenamiento guardados aún."

    resultados = []
    termino_lower = termino.lower()

    with open(ARCHIVO_ENTRENAMIENTO, "r", encoding="utf-8") as f:
        for linea in f:
            linea = linea.strip()
            if not linea:
                continue
            try:
                dato = json.loads(linea)
                if (
                    termino_lower in dato.get("pregunta", "").lower()
                    or termino_lower in dato.get("respuesta", "").lower()
                ):
                    resultados.append(
                        f"P: {dato['pregunta'][:80]}... "
                        f"R: {dato['respuesta'][:80]}..."
                    )
                    if len(resultados) >= 3:
                        break
            except json.JSONDecodeError:
                continue

    if not resultados:
        return f"No encontré ejemplos guardados sobre '{termino}'."

    return f"Encontré {len(resultados)} ejemplo(s) sobre '{termino}':\n" + "\n".join(
        f"- {r}" for r in resultados
    )


# ============================================
# SANITIZACIÓN DE RESPUESTA (qwen2.5)
# ============================================
# qwen2.5 sigue las instrucciones del prompt correctamente, así que
# solo necesitamos limpiar artefactos de formato meta (separadores,
# cabeceras de instrucciones). Los filtros agresivos de phi3 se
# eliminaron porque en qwen2.5 cortaban texto legítimo.

_PATRONES_ALUCINACION = [
    # Restos de bloques de instrucciones que el modelo podría repetir
    r"\n---[\s\S]*$",
    r"\n#{2,4}\s+(Instrucción|Reglas?|Limitacion|Saludo|ROL|IDIOMA|Rol)[^\n]*[\s\S]*$",
]
_REGEX_ALUCINACION = [re.compile(p, re.IGNORECASE) for p in _PATRONES_ALUCINACION]


def limpiar_respuesta_modelo(texto: str) -> str:
    """
    Elimina alucinaciones típicas de phi3: system prompts inventados,
    bloques de instrucciones, roles falsos, etc.
    """
    if not texto:
        return texto

    for patron in _REGEX_ALUCINACION:
        texto = patron.sub("", texto)

    lineas = texto.split("\n")
    lineas_limpias: list[str] = []
    for linea in lineas:
        if re.match(r"^#{2,4}\s+(Instrucción|Regla|Limitación|ROL|Saludo)", linea, re.IGNORECASE):
            break
        if re.match(r"^---\s*$", linea):
            break
        lineas_limpias.append(linea)

    resultado = "\n".join(lineas_limpias).strip()
    return resultado or "¡Hola! ¿En qué puedo ayudarte hoy?"


# Máximo de turnos (pares usuario/asistente) que se mandan como contexto.
# Con phi3 en GTX 1650 (~4 GB VRAM) más de 10 turnos puede exceder el contexto.
MAX_HISTORIAL = 10


def _extraer_texto_respuesta(resultado) -> str:
    """
    Extrae el texto de la respuesta de Strands de forma robusta.
    Strands devuelve un objeto AgentResult; accedemos a .message
    con fallback a str() como último recurso.
    """
    if hasattr(resultado, "message") and isinstance(resultado.message, str):
        return resultado.message
    return str(resultado)


def _construir_mensajes_historial(historial: list[MensajeHistorial]) -> list[dict]:
    """
    Convierte el historial del frontend al formato de mensajes que
    espera Strands Agent internamente (compatible con Bedrock/Ollama).

    Formato esperado por Strands:
        [{"role": "user"|"assistant", "content": [{"type": "text", "text": "..."}]}]

    Solo se envían los últimos MAX_HISTORIAL turnos para no saturar
    la ventana de contexto del modelo.
    """
    # Tomamos solo los últimos N mensajes del historial
    historial_reciente = historial[-MAX_HISTORIAL:]

    mensajes_formateados = []
    for m in historial_reciente:
        role = "user" if m.rol == "usuario" else "assistant"
        mensajes_formateados.append({
            "role": role,
            "content": [{"type": "text", "text": m.contenido}],
        })
    return mensajes_formateados


# ============================================
# FUNCIONES DE PERSISTENCIA (JSONL)
# ============================================

def leer_datos_entrenamiento() -> list[dict]:
    """Lee todos los ejemplos guardados en el archivo JSONL."""
    if not os.path.exists(ARCHIVO_ENTRENAMIENTO):
        return []
    datos: list[dict] = []
    with open(ARCHIVO_ENTRENAMIENTO, "r", encoding="utf-8") as archivo:
        for linea in archivo:
            linea = linea.strip()
            if linea:
                datos.append(json.loads(linea))
    return datos


def guardar_dato_en_archivo(dato: dict) -> None:
    """Agrega un ejemplo al archivo JSONL de entrenamiento (append-only)."""
    with open(ARCHIVO_ENTRENAMIENTO, "a", encoding="utf-8") as archivo:
        archivo.write(json.dumps(dato, ensure_ascii=False) + "\n")


def reescribir_datos_entrenamiento(datos: list[dict]) -> None:
    """Reescribe todos los datos de entrenamiento (usado al eliminar)."""
    with open(ARCHIVO_ENTRENAMIENTO, "w", encoding="utf-8") as archivo:
        for dato in datos:
            archivo.write(json.dumps(dato, ensure_ascii=False) + "\n")


# ============================================
# ENDPOINTS
# ============================================

@aplicacion.get("/estado", tags=["Sistema"])
async def verificar_estado():
    """Verifica el estado del servidor y la conexión con Ollama."""
    try:
        lista = ollama_client.list()
        nombres_modelos = [m.model for m in lista.models]
        return {
            "estado": "activo",
            "ollama": "conectado",
            "modelos_disponibles": nombres_modelos,
            "modelo_actual": MODELO_IA,
        }
    except Exception as error:
        logger.warning("Ollama no responde: %s", error)
        return {
            "estado": "activo",
            "ollama": "desconectado",
            "error": str(error),
            "modelo_actual": MODELO_IA,
        }


@aplicacion.post("/chat", tags=["Chat"])
async def enviar_mensaje(
    solicitud: SolicitudChat,
    agente: Agent = Depends(obtener_agente),
):
    """
    Envía un mensaje al modelo de IA usando Strands Agent.

    - Un Agent nuevo se crea por request (aislamiento de sesión).
    - La llamada síncrona al agente se delega a un executor para no
      bloquear el event loop de FastAPI (asyncio best practice).
    """
    logger.info(
        "Chat request | modelo=%s | historial=%d turnos | msg=%r",
        solicitud.modelo,
        len(solicitud.historial),
        solicitud.mensaje[:60],
    )

    try:
        # Pre-poblar el agente con el historial de la conversación
        # ANTES de llamarlo con el mensaje nuevo.
        if solicitud.historial:
            agente.messages = _construir_mensajes_historial(solicitud.historial)
            logger.debug("Historial cargado: %d mensajes previos.", len(agente.messages))

        loop = asyncio.get_event_loop()
        # run_in_executor corre la llamada síncrona de Strands en un
        # hilo separado, liberando el event loop de FastAPI.
        resultado = await loop.run_in_executor(
            None,
            partial(agente, solicitud.mensaje),
        )

        contenido_crudo = _extraer_texto_respuesta(resultado)
        contenido = limpiar_respuesta_modelo(contenido_crudo)

        logger.info("Respuesta generada (%d chars).", len(contenido))
        return {
            "respuesta": contenido,
            "modelo": solicitud.modelo,
            "exito": True,
        }

    except Exception as error:
        logger.exception("Error en /chat: %s", error)
        msg = str(error).lower()
        if "connection" in msg or "connect" in msg:
            raise HTTPException(
                status_code=503,
                detail="No se pudo conectar con Ollama. ¿Está corriendo en localhost:11434?",
            )
        if "timeout" in msg:
            raise HTTPException(
                status_code=504,
                detail="El modelo tardó demasiado en responder. Intentá de nuevo.",
            )
        raise HTTPException(status_code=500, detail=f"Error inesperado: {error}")


@aplicacion.post("/guardar-entrenamiento", tags=["Entrenamiento"])
async def guardar_dato_entrenamiento(dato: DatoEntrenamiento):
    """
    Guarda un par pregunta/respuesta como ejemplo de entrenamiento.
    Los datos se guardan en formato JSONL para fine-tuning futuro.
    """
    ejemplo = {
        "pregunta": dato.pregunta,
        "respuesta": dato.respuesta,
        "modelo": dato.modelo,
        "notas": dato.notas,
        "fecha": datetime.now().isoformat(),
    }
    guardar_dato_en_archivo(ejemplo)
    cantidad_total = len(leer_datos_entrenamiento())
    logger.info("Dato de entrenamiento guardado. Total: %d", cantidad_total)
    return {
        "mensaje": "Dato de entrenamiento guardado correctamente",
        "total_ejemplos": cantidad_total,
        "ejemplo_guardado": ejemplo,
    }


@aplicacion.get("/obtener-datos-entrenamiento", tags=["Entrenamiento"])
async def obtener_datos_entrenamiento():
    """Retorna todos los ejemplos de entrenamiento guardados."""
    datos = leer_datos_entrenamiento()
    return {"datos": datos, "total": len(datos)}


@aplicacion.delete("/eliminar-dato/{indice}", tags=["Entrenamiento"])
async def eliminar_dato_entrenamiento(indice: int):
    """Elimina un ejemplo de entrenamiento por su índice (0-based)."""
    datos = leer_datos_entrenamiento()
    if indice < 0 or indice >= len(datos):
        raise HTTPException(
            status_code=404,
            detail=f"No existe un dato con índice {indice}. Total: {len(datos)}",
        )
    dato_eliminado = datos.pop(indice)
    reescribir_datos_entrenamiento(datos)
    return {
        "mensaje": "Dato eliminado correctamente",
        "dato_eliminado": dato_eliminado,
        "total_restante": len(datos),
    }


@aplicacion.delete("/limpiar-entrenamiento", tags=["Entrenamiento"])
async def limpiar_todos_los_datos():
    """Elimina TODOS los datos de entrenamiento. ¡Usar con cuidado!"""
    reescribir_datos_entrenamiento([])
    logger.warning("Todos los datos de entrenamiento fueron eliminados.")
    return {"mensaje": "Todos los datos de entrenamiento fueron eliminados"}