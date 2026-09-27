import React, { useMemo } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

// Editor per il testo delle email: formattazione essenziale, niente di esotico
// che i client di posta non saprebbero mostrare.
export default function RichTextEditor({ value, onChange, placeholder, minHeight = 220 }) {
  const modules = useMemo(() => ({
    toolbar: [
      ["bold", "italic", "underline"],
      [{ list: "ordered" }, { list: "bullet" }],
      ["link"],
      [{ align: [] }],
      ["clean"],
    ],
    clipboard: { matchVisual: false },
  }), []);

  return (
    <div className="talo-editor rounded-md border border-input overflow-hidden bg-white">
      <ReactQuill
        theme="snow"
        value={value}
        onChange={(html) => onChange(html === "<p><br></p>" ? "" : html)}
        modules={modules}
        placeholder={placeholder}
      />
      <style>{`
        .talo-editor .ql-toolbar.ql-snow { border: 0; border-bottom: 1px solid hsl(var(--border)); background: #f8fafc; }
        .talo-editor .ql-container.ql-snow { border: 0; font-family: inherit; font-size: 14px; }
        .talo-editor .ql-editor { min-height: ${minHeight}px; line-height: 1.6; }
        .talo-editor .ql-editor.ql-blank::before { font-style: normal; color: #94a3b8; }
      `}</style>
    </div>
  );
}
