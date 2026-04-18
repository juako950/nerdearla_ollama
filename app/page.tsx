"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

// ============================================
// TIPOS
// ============================================

type Mensaje = {
  remitente: "usuario" | "asistente";
  contenido: string;
  tipo?: "error";
  id: number;
};

type DatoEntrenamiento = {
  pregunta: string;
  respuesta: string;
  modelo: string;
  notas: string;
  fecha: string;
};

type TabActiva = "chat" | "entrenamiento";

// ============================================
// API — FUNCIONES EN ESPAÑOL
// ============================================

const URL_API = "http://localhost:8000";

async function enviarMensajeAPI(mensaje: string): Promise<string> {
  const respuesta = await fetch(`${URL_API}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mensaje }),
  });
  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => ({}));
    throw new Error(error.detail || `Error ${respuesta.status}`);
  }
  const datos = await respuesta.json();
  return datos.respuesta ?? "Sin respuesta";
}

async function guardarDatoEntrenamiento(
  pregunta: string,
  respuesta: string,
  notas = ""
): Promise<void> {
  const res = await fetch(`${URL_API}/guardar-entrenamiento`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pregunta, respuesta, notas }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || "No se pudo guardar");
  }
}

async function obtenerDatosEntrenamiento(): Promise<DatoEntrenamiento[]> {
  const respuesta = await fetch(`${URL_API}/obtener-datos-entrenamiento`);
  if (!respuesta.ok) throw new Error("No se pudieron obtener los datos");
  const datos = await respuesta.json();
  return datos.datos ?? [];
}

async function eliminarDatoEntrenamiento(indice: number): Promise<void> {
  const respuesta = await fetch(`${URL_API}/eliminar-dato/${indice}`, {
    method: "DELETE",
  });
  if (!respuesta.ok) throw new Error("No se pudo eliminar el dato");
}

// ============================================
// COMPONENTES UI
// ============================================

function LogoOllama() {
  return (
    <img
      src="/ollama.jpg"
      alt="Nerdbot"
      className="h-8 w-8 rounded-full object-cover"
    />
  );
}

function IconoEnviar() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function IconoNuevoChat() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconoCheck() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconoEditar() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4Z" />
    </svg>
  );
}

function IconoBasura() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 6h18M19 6l-1 14H6L5 6M10 6V4h4v2" />
    </svg>
  );
}

function IndicadorEscribiendo() {
  return (
    <div className="flex items-start gap-4 px-4 py-6 md:px-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border">
        <LogoOllama />
      </div>
      <div className="flex items-center gap-1 pt-2 typing-indicator">
        <span className="h-2 w-2 rounded-full bg-foreground/60" />
        <span className="h-2 w-2 rounded-full bg-foreground/60" />
        <span className="h-2 w-2 rounded-full bg-foreground/60" />
      </div>
    </div>
  );
}

// ============================================
// COMPONENTE: PANEL DE ENTRENAMIENTO EN MENSAJE
// ============================================

function PanelEntrenamiento({
  pregunta,
  respuesta,
  onGuardado,
}: {
  pregunta: string;
  respuesta: string;
  onGuardado: () => void;
}) {
  const [modoEdicion, setModoEdicion] = useState(false);
  const [respuestaEditada, setRespuestaEditada] = useState(respuesta);
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState("");

  const manejarGuardar = async (respuestaFinal: string) => {
    setGuardando(true);
    setError("");
    try {
      await guardarDatoEntrenamiento(pregunta, respuestaFinal, notas);
      setGuardado(true);
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  };

  if (guardado) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
        <IconoCheck />
        <span>Guardado como dato de entrenamiento ✓</span>
      </div>
    );
  }

  if (modoEdicion) {
    return (
      <div className="mt-3 rounded-lg border border-border bg-muted/50 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Editar respuesta antes de guardar:</p>
        <textarea
          className="w-full resize-none rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
          rows={4}
          value={respuestaEditada}
          onChange={(e) => setRespuestaEditada(e.target.value)}
        />
        <input
          className="mt-2 w-full rounded-md border border-border bg-white px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          placeholder="Notas opcionales (ej: 'respuesta mejorada')"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
        />
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => manejarGuardar(respuestaEditada)}
            disabled={guardando || !respuestaEditada.trim()}
            className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-sm text-background transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            <IconoCheck />
            {guardando ? "Guardando..." : "Guardar"}
          </button>
          <button
            onClick={() => setModoEdicion(false)}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <span className="text-xs text-muted-foreground">¿Usar para entrenar?</span>
      <button
        onClick={() => manejarGuardar(respuesta)}
        disabled={guardando}
        title="Guardar respuesta como ejemplo de entrenamiento"
        className="flex items-center gap-1 rounded-md border border-green-300 bg-green-50 px-2.5 py-1 text-xs text-green-700 transition-colors hover:bg-green-100 disabled:opacity-40"
      >
        <IconoCheck />
        Correcta
      </button>
      <button
        onClick={() => setModoEdicion(true)}
        title="Editar respuesta antes de guardar"
        className="flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs text-blue-700 transition-colors hover:bg-blue-100"
      >
        <IconoEditar />
        Mejorar
      </button>
    </div>
  );
}

// ============================================
// COMPONENTE: BURBUJA DE MENSAJE
// ============================================

function MensajeChat({
  mensaje,
  preguntaAnterior,
  onDatoGuardado,
}: {
  mensaje: Mensaje;
  preguntaAnterior?: string;
  onDatoGuardado: () => void;
}) {
  const esUsuario = mensaje.remitente === "usuario";
  const esError = mensaje.tipo === "error";

  if (esUsuario) {
    return (
      <div className="flex items-start justify-end gap-4 px-4 py-6 md:px-0">
        <div className="max-w-[85%] md:max-w-[70%]">
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
            {mensaje.contenido}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4 px-4 py-6 md:px-0">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
          esError ? "border-red-300 text-red-600" : "border-border"
        }`}
      >
        <LogoOllama />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`whitespace-pre-wrap text-[15px] leading-relaxed ${
            esError ? "text-red-600" : "text-foreground"
          }`}
        >
          {mensaje.contenido}
        </p>
        {!esError && preguntaAnterior && (
          <PanelEntrenamiento
            pregunta={preguntaAnterior}
            respuesta={mensaje.contenido}
            onGuardado={onDatoGuardado}
          />
        )}
      </div>
    </div>
  );
}

// ============================================
// COMPONENTE: ESTADO VACÍO
// ============================================

function EstadoVacio() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-border">
        <LogoOllama />
      </div>
      <h2 className="mb-2 text-xl font-medium text-foreground">
        ¿En qué puedo ayudarte?
      </h2>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        Escribe un mensaje para comenzar. Cada respuesta puede guardarse
        como ejemplo de entrenamiento para mejorar el modelo.
      </p>
    </div>
  );
}

// ============================================
// COMPONENTE: BARRA DE ENTRADA
// ============================================

function BarraEntrada({
  valor,
  onCambio,
  onEnviar,
  deshabilitado,
}: {
  valor: string;
  onCambio: (valor: string) => void;
  onEnviar: (evento: FormEvent<HTMLFormElement>) => void;
  deshabilitado: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [valor]);

  const manejarKeyDown = (evento: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (evento.key === "Enter" && !evento.shiftKey) {
      evento.preventDefault();
      const form = evento.currentTarget.form;
      if (form && valor.trim()) {
        form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
      }
    }
  };

  return (
    <div className="border-t border-border bg-white px-4 py-4">
      <form onSubmit={onEnviar} className="mx-auto flex max-w-3xl items-end gap-3">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            className="w-full resize-none rounded-2xl border border-border bg-muted px-4 py-3 pr-12 text-[15px] text-foreground placeholder:text-muted-foreground focus:border-foreground/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Envía un mensaje..."
            value={valor}
            onChange={(e) => onCambio(e.target.value)}
            onKeyDown={manejarKeyDown}
            disabled={deshabilitado}
            rows={1}
            style={{ maxHeight: "200px" }}
          />
          <button
            type="submit"
            disabled={deshabilitado || !valor.trim()}
            className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Enviar mensaje"
          >
            <IconoEnviar />
          </button>
        </div>
      </form>
      <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-muted-foreground">
        Conectado a{" "}
        <span className="font-medium">localhost:8000</span>
        {" · "}Nerdbot · phi3
      </p>
    </div>
  );
}

// ============================================
// COMPONENTE: PESTAÑA DE DATOS DE ENTRENAMIENTO
// ============================================

function TabDatosEntrenamiento() {
  const [datos, setDatos] = useState<DatoEntrenamiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const resultado = await obtenerDatosEntrenamiento();
      setDatos(resultado);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const manejarEliminar = async (indice: number) => {
    if (!confirm("¿Eliminar este dato de entrenamiento?")) return;
    try {
      await eliminarDatoEntrenamiento(indice);
      setDatos((prev) => prev.filter((_, i) => i !== indice));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  if (cargando) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">Cargando datos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-red-500">{error}</p>
        <button
          onClick={cargarDatos}
          className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            Datos de Entrenamiento
          </p>
          <p className="text-xs text-muted-foreground">
            {datos.length} ejemplo{datos.length !== 1 ? "s" : ""} guardado{datos.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={cargarDatos}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted"
        >
          Actualizar
        </button>
      </div>

      {datos.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
          <p className="text-4xl">🧠</p>
          <p className="text-sm font-medium text-foreground">Sin datos aún</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Cuando el modelo responda en el chat, marcá las respuestas
            correctas con el botón <strong>Correcta ✓</strong> para
            guardarlas aquí.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-border/50">
          {datos.map((dato, indice) => (
            <div key={indice} className="px-4 py-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Pregunta
                  </p>
                  <p className="mb-3 text-sm text-foreground">{dato.pregunta}</p>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Respuesta
                  </p>
                  <p className="text-sm text-foreground line-clamp-4">
                    {dato.respuesta}
                  </p>
                  {dato.notas && (
                    <p className="mt-2 text-xs text-muted-foreground italic">
                      Nota: {dato.notas}
                    </p>
                  )}
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {new Date(dato.fecha).toLocaleString("es-AR")} · {dato.modelo}
                  </p>
                </div>
                <button
                  onClick={() => manejarEliminar(indice)}
                  title="Eliminar este dato"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500"
                >
                  <IconoBasura />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// PÁGINA PRINCIPAL
// ============================================

export default function Pagina() {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [tabActiva, setTabActiva] = useState<TabActiva>("chat");
  const [contadorActualizacion, setContadorActualizacion] = useState(0);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const contadorId = useRef(0);

  useEffect(() => {
    if (contenedorRef.current) {
      contenedorRef.current.scrollTop = contenedorRef.current.scrollHeight;
    }
  }, [mensajes, cargando]);

  const limpiarChat = () => {
    setMensajes([]);
    setTexto("");
  };

  const alGuardarDato = () => {
    setContadorActualizacion((c) => c + 1);
  };

  const enviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const prompt = texto.trim();
    if (!prompt) return;

    const idMensaje = ++contadorId.current;
    setTexto("");
    setMensajes((prev) => [
      ...prev,
      { remitente: "usuario", contenido: prompt, id: idMensaje },
    ]);
    setCargando(true);

    try {
      const textoRespuesta = await enviarMensajeAPI(prompt);
      const idRespuesta = ++contadorId.current;
      setMensajes((prev) => [
        ...prev,
        {
          remitente: "asistente",
          contenido: textoRespuesta || "No se recibió respuesta.",
          id: idRespuesta,
        },
      ]);
    } catch (e) {
      const mensajeError = e instanceof Error ? e.message : "Error inesperado";
      const idError = ++contadorId.current;
      setMensajes((prev) => [
        ...prev,
        {
          remitente: "asistente",
          contenido: `No se pudo conectar con el servidor. ${mensajeError}`,
          tipo: "error",
          id: idError,
        },
      ]);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          <LogoOllama />
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Nerdbot</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Local
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Tabs */}
          <div className="flex rounded-lg border border-border p-0.5">
            <button
              id="tab-chat"
              onClick={() => setTabActiva("chat")}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                tabActiva === "chat"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Chat
            </button>
            <button
              id="tab-entrenamiento"
              onClick={() => setTabActiva("entrenamiento")}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                tabActiva === "entrenamiento"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              🧠 Entrenamiento
            </button>
          </div>

          {tabActiva === "chat" && (
            <button
              onClick={limpiarChat}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              aria-label="Nuevo chat"
            >
              <IconoNuevoChat />
              <span className="hidden sm:inline">Nuevo chat</span>
            </button>
          )}
        </div>
      </header>

      {/* Contenido según tab */}
      {tabActiva === "chat" ? (
        <>
          {/* Área de mensajes */}
          <div ref={contenedorRef} className="flex-1 overflow-y-auto chat-scroll">
            {mensajes.length === 0 ? (
              <EstadoVacio />
            ) : (
              <div className="mx-auto max-w-3xl divide-y divide-border/50">
                {mensajes.map((mensaje, idx) => {
                  // Buscar la pregunta del usuario anterior a esta respuesta
                  const preguntaAnterior =
                    mensaje.remitente === "asistente"
                      ? mensajes
                          .slice(0, idx)
                          .reverse()
                          .find((m) => m.remitente === "usuario")?.contenido
                      : undefined;

                  return (
                    <MensajeChat
                      key={mensaje.id}
                      mensaje={mensaje}
                      preguntaAnterior={preguntaAnterior}
                      onDatoGuardado={alGuardarDato}
                    />
                  );
                })}
                {cargando && <IndicadorEscribiendo />}
              </div>
            )}
          </div>

          {/* Input fijo abajo */}
          <BarraEntrada
            valor={texto}
            onCambio={setTexto}
            onEnviar={enviar}
            deshabilitado={cargando}
          />
        </>
      ) : (
        <div className="flex-1 overflow-hidden">
          <TabDatosEntrenamiento key={contadorActualizacion} />
        </div>
      )}
    </div>
  );
}
