import json
import os
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx

# ============================================
# CONFIGURACIÓN DE LA APLICACIÓN
# ============================================

aplicacion = FastAPI(
    title="API Ollama - Agente IA",
    description="API para chatear con Ollama y recopilar datos de entrenamiento",
    version="1.0.0",
)

aplicacion.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuración del modelo y rutas
URL_OLLAMA = "http://localhost:11434"
MODELO_IA = "phi3"
ARCHIVO_ENTRENAMIENTO = os.path.join(os.path.dirname(__file__), "datos_entrenamiento.jsonl")

# ============================================
# SYSTEM PROMPT — PERSONALIDAD DE PHI-3
# ============================================
# Diseñado para GTX 1650 (VRAM limitada): respuestas cortas y directas.
# Usa /api/chat de Ollama para que el rol 'system' se aplique correctamente.

SYSTEM_PROMPT = """Eres un asistente virtual inteligente, amigable y versátil. Tu nombre es Nerdbot. Podés ayudar con cualquier tema que el usuario necesite.

## ROL
Sos un asistente de propósito general con conocimientos amplios en tecnología, ciencia, cultura, cocina, viajes, salud, entretenimiento, educación y vida cotidiana. Sos amable, cercano y hablás de forma natural, como un amigo que sabe mucho.

## REGLAS DE FORMATO
1. Respondé de forma clara, concisa y directa.
2. Usá un tono conversacional y amigable. Podés usar expresiones naturales como "¡Buena pregunta!" o "Mirá, lo que pasa es..." cuando sea apropiado.
3. Si te piden código o algo técnico, entregalo limpio y bien explicado.
4. Si te piden una receta, un consejo, una recomendación o cualquier cosa del día a día, respondé con entusiasmo y de forma útil.
5. Usá listas o pasos numerados cuando faciliten la comprensión.
6. NUNCA repitas la pregunta del usuario textualmente.

## IDIOMA
Respondés en español. Si el usuario escribe en otro idioma, respondé en ese mismo idioma.

## LÍMITE DE RESPUESTA
Por restricciones de hardware (GPU GTX 1650, VRAM limitada), mantené las respuestas bajo 300 palabras. Si la respuesta requiere más detalle, indicá al final: "[Continúa — pedime la siguiente parte]"."""


# ============================================
# MODELOS DE DATOS (Pydantic)
# ============================================

class SolicitudChat(BaseModel):
    mensaje: str
    modelo: str = MODELO_IA

class DatoEntrenamiento(BaseModel):
    pregunta: str
    respuesta: str
    modelo: str = MODELO_IA
    notas: str = ""


# ============================================
# FUNCIONES AUXILIARES
# ============================================

def leer_datos_entrenamiento() -> list[dict]:
    """Lee todos los ejemplos guardados en el archivo JSONL."""
    if not os.path.exists(ARCHIVO_ENTRENAMIENTO):
        return []
    datos = []
    with open(ARCHIVO_ENTRENAMIENTO, "r", encoding="utf-8") as archivo:
        for linea in archivo:
            linea = linea.strip()
            if linea:
                datos.append(json.loads(linea))
    return datos


def guardar_dato_en_archivo(dato: dict) -> None:
    """Agrega un ejemplo al archivo JSONL de entrenamiento."""
    with open(ARCHIVO_ENTRENAMIENTO, "a", encoding="utf-8") as archivo:
        archivo.write(json.dumps(dato, ensure_ascii=False) + "\n")


def reescribir_datos_entrenamiento(datos: list[dict]) -> None:
    """Reescribe todos los datos de entrenamiento (usado al eliminar)."""
    with open(ARCHIVO_ENTRENAMIENTO, "w", encoding="utf-8") as archivo:
        for dato in datos:
            archivo.write(json.dumps(dato, ensure_ascii=False) + "\n")


# ============================================
# ENDPOINTS DE LA API
# ============================================

@aplicacion.get("/estado")
async def verificar_estado():
    """Verifica el estado del servidor y la conexión con Ollama."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as cliente:
            respuesta = await cliente.get(f"{URL_OLLAMA}/api/tags")
            modelos_disponibles = respuesta.json().get("models", [])
            nombres_modelos = [m["name"] for m in modelos_disponibles]
        return {
            "estado": "activo",
            "ollama": "conectado",
            "modelos_disponibles": nombres_modelos,
            "modelo_actual": MODELO_IA,
        }
    except Exception as error:
        return {
            "estado": "activo",
            "ollama": "desconectado",
            "error": str(error),
            "modelo_actual": MODELO_IA,
        }


@aplicacion.post("/chat")
async def enviar_mensaje(solicitud: SolicitudChat):
    """
    Envía un mensaje al modelo de IA y devuelve la respuesta.
    Usa /api/chat de Ollama para aplicar correctamente el system prompt.
    """
    if not solicitud.mensaje.strip():
        raise HTTPException(status_code=400, detail="El mensaje no puede estar vacío")

    # Usamos /api/chat (no /api/generate) para soporte real de system prompt
    cuerpo_peticion = {
        "model": solicitud.modelo,
        "stream": False,
        "messages": [
            {
                "role": "system",
                "content": SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": solicitud.mensaje,
            },
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=120.0) as cliente:
            respuesta_ollama = await cliente.post(
                f"{URL_OLLAMA}/api/chat",
                json=cuerpo_peticion,
            )
            respuesta_ollama.raise_for_status()
            datos_respuesta = respuesta_ollama.json()

        # /api/chat devuelve la respuesta en message.content
        contenido = datos_respuesta.get("message", {}).get("content", "")

        return {
            "respuesta": contenido.strip(),
            "modelo": solicitud.modelo,
            "exito": True,
        }

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="El modelo tardó demasiado en responder. Intentá de nuevo.",
        )
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="No se pudo conectar con Ollama. ¿Está corriendo en localhost:11434?",
        )
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Error inesperado: {str(error)}",
        )


@aplicacion.post("/guardar-entrenamiento")
async def guardar_dato_entrenamiento(dato: DatoEntrenamiento):
    """
    Guarda un par pregunta/respuesta como ejemplo de entrenamiento.
    Los datos se guardan en formato JSONL para fine-tuning futuro.
    """
    if not dato.pregunta.strip() or not dato.respuesta.strip():
        raise HTTPException(
            status_code=400,
            detail="La pregunta y la respuesta no pueden estar vacías",
        )

    from datetime import datetime

    ejemplo = {
        "pregunta": dato.pregunta.strip(),
        "respuesta": dato.respuesta.strip(),
        "modelo": dato.modelo,
        "notas": dato.notas.strip(),
        "fecha": datetime.now().isoformat(),
    }

    guardar_dato_en_archivo(ejemplo)

    cantidad_total = len(leer_datos_entrenamiento())
    return {
        "mensaje": "Dato de entrenamiento guardado correctamente",
        "total_ejemplos": cantidad_total,
        "ejemplo_guardado": ejemplo,
    }


@aplicacion.get("/obtener-datos-entrenamiento")
async def obtener_datos_entrenamiento():
    """Retorna todos los ejemplos de entrenamiento guardados."""
    datos = leer_datos_entrenamiento()
    return {
        "datos": datos,
        "total": len(datos),
    }


@aplicacion.delete("/eliminar-dato/{indice}")
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


@aplicacion.delete("/limpiar-entrenamiento")
async def limpiar_todos_los_datos():
    """Elimina TODOS los datos de entrenamiento. ¡Usar con cuidado!"""
    reescribir_datos_entrenamiento([])
    return {"mensaje": "Todos los datos de entrenamiento fueron eliminados"}