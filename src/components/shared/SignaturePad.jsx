import React, { useRef, useState, useEffect } from "react";
import { Eraser, Upload, Check, Maximize2, Minimize2 } from "lucide-react";

export default function SignaturePad({ value, onChange, label = "Firma" }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [enlarged, setEnlarged] = useState(false);

  const drawImageOnCanvas = (dataUrl) => {
    if (!canvasRef.current || !dataUrl) return;
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
    img.src = dataUrl;
  };

  useEffect(() => {
    if (value && canvasRef.current) {
      drawImageOnCanvas(value);
      setHasDrawn(true);
    }
  }, []);

  const toggleSize = () => {
    const currentData = hasDrawn ? canvasRef.current?.toDataURL("image/png") : null;
    setEnlarged(prev => !prev);
    // Redraw after the canvas height attribute changes (next tick)
    setTimeout(() => {
      if (currentData) drawImageOnCanvas(currentData);
    }, 0);
  };

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvasRef.current.width / rect.width),
      y: (clientY - rect.top) * (canvasRef.current.height / rect.height),
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const pos = getPos(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (canvasRef.current) {
      onChange(canvasRef.current.toDataURL("image/png"));
    }
  };

  const clear = () => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasDrawn(false);
    onChange("");
  };

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ctx = canvasRef.current.getContext("2d");
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
        setHasDrawn(true);
        onChange(canvasRef.current.toDataURL("image/png"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <div className="flex gap-1">
          <button onClick={toggleSize} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-brand-600" title={enlarged ? "Riduci" : "Ingrandisci"}>
            {enlarged ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <label className="cursor-pointer p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-600" title="Carica immagine firma">
            <Upload className="w-4 h-4" />
            <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          </label>
          <button onClick={clear} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-red-600" title="Cancella">
            <Eraser className="w-4 h-4" />
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={500}
        height={enlarged ? 320 : 150}
        className="w-full border-2 border-dashed border-slate-300 rounded-lg bg-white touch-none cursor-crosshair transition-all"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
      />
      {!hasDrawn && (
        <p className="text-xs text-slate-500 mt-1 text-center">Firma con il dito/mouse o carica un'immagine</p>
      )}
      {hasDrawn && (
        <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1">
          <Check className="w-3 h-3" /> Firma apposta
        </p>
      )}
    </div>
  );
}