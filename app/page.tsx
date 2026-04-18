"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Mensaje = {
  remitente: "usuario" | "asistente";
  contenido: string;
  tipo?: "error";
};

// ============================================
// COMPONENTES
// ============================================

function LogoOllama() {
  return (
    <img
      src="/ollama.jpg"
      alt="Ollama"
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

function MensajeChat({ mensaje }: { mensaje: Mensaje }) {
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
      </div>
    </div>
  );
}

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
        Escribe un mensaje para comenzar la conversación con el modelo local.
      </p>
    </div>
  );
}

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
        form.dispatchEvent(
          new Event("submit", { cancelable: true, bubbles: true })
        );
      }
    }
  };

  return (
    <div className="border-t border-border bg-white px-4 py-4">
      <form
        onSubmit={onEnviar}
        className="mx-auto flex max-w-3xl items-end gap-3"
      >
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
        {" · "}Ollama
      </p>
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
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contenedorRef.current) {
      contenedorRef.current.scrollTop = contenedorRef.current.scrollHeight;
    }
  }, [mensajes, cargando]);

  const limpiarChat = () => {
    setMensajes([]);
    setTexto("");
  };

  const enviar = async (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const prompt = texto.trim();
    if (!prompt) return;

    setTexto("");
    setMensajes((prev) => [...prev, { remitente: "usuario", contenido: prompt }]);
    setCargando(true);

    try {
      const respuesta = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!respuesta.ok) {
        throw new Error(`Error ${respuesta.status}`);
      }

      const dato = await respuesta.json();
      const textoRespuesta =
        typeof dato.response === "string"
          ? dato.response.trim()
          : "Respuesta inválida";

      setMensajes((prev) => [
        ...prev,
        {
          remitente: "asistente",
          contenido: textoRespuesta || "No se recibió respuesta.",
        },
      ]);
    } catch (e) {
      const mensajeError = e instanceof Error ? e.message : "Error inesperado";
      setMensajes((prev) => [
        ...prev,
        {
          remitente: "asistente",
          contenido: `No se pudo conectar con el servidor. ${mensajeError}`,
          tipo: "error",
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
            <span className="text-sm font-medium text-foreground">Ollama</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Local
            </span>
          </div>
        </div>

        <button
          onClick={limpiarChat}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          aria-label="Nuevo chat"
        >
          <IconoNuevoChat />
          <span className="hidden sm:inline">Nuevo chat</span>
        </button>
      </header>

      {/* Área de mensajes */}
      <div
        ref={contenedorRef}
        className="flex-1 overflow-y-auto chat-scroll"
      >
        {mensajes.length === 0 ? (
          <EstadoVacio />
        ) : (
          <div className="mx-auto max-w-3xl divide-y divide-border/50">
            {mensajes.map((mensaje, idx) => (
              <MensajeChat key={`${mensaje.remitente}-${idx}`} mensaje={mensaje} />
            ))}
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
    </div>
  );
}
