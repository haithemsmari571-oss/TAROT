import { useState, useRef, useEffect, type DragEvent } from "react";
import { Icon } from "@iconify/react";

interface PrimaryDropzoneProps {
  onUpload: (file: File | null) => void;
  accept?: string[];
  textUploadFile?: string;
  textReplaceFile?: string;
  textDropHere?: string;
  textInvalidFile?: string;
  maxSizeMB?: number;
}

export default function PrimaryDropzone({
  onUpload,
  accept = ["image/jpeg", "image/png"],
  textUploadFile = "Upload File",
  textReplaceFile = "Drop a new file to replace the current one",
  textDropHere = "Drop file here",
  textInvalidFile = "Invalid file type",
  maxSizeMB = 10,
}: PrimaryDropzoneProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const f = files[0];

    if (!accept.includes(f.type)) {
      setError(textInvalidFile);
      return;
    }

    if (f.size > maxSizeMB * 1024 * 1024) {
      setError(`File exceeds ${maxSizeMB}MB`);
      return;
    }

    setError(null);
    setFile(f);
    onUpload(f);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleClick = () => inputRef.current?.click();
  const removeFile = () => {
    setFile(null);
    setError(null);
    onUpload(null);
  };

  // Map Solar icons
  const getIcon = () => {
    if (file) return <Icon icon={"solar:gallery-check-bold-duotone"} className="w-12 h-12 text-green-600" />;
    if (isDragOver) return <Icon icon={"solar:cloud-upload-bold-duotone"} className="w-12 h-12 text-blue-600 animate-bounce" />;
    return <Icon icon={"solar:gallery-add-bold-duotone"} className="w-12 h-12 text-gray-600 group-hover:text-gray-700" />;
  };

  const getFileIcon = () => <Icon icon={"solar:file-send-bold-duotone"} className="w-16 h-16 text-gray-400 text-5xl" />;

  return (
    <div className="w-full mx-auto space-y-4">
      <div
        onClick={handleClick}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-300 ease-out group overflow-hidden
          ${isDragOver 
            ? "border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-xl scale-[1.02]" 
            : file 
              ? "border-green-400 bg-gradient-to-br from-green-50 to-emerald-50 hover:shadow-lg hover:border-green-500" 
              : "border-gray-300 bg-gradient-to-br from-gray-50 to-slate-50 hover:border-gray-400 hover:shadow-md hover:bg-gradient-to-br hover:from-gray-100 hover:to-slate-100"
          }`}
      >
        <div className="relative z-10 rounded-full p-4 transition-all duration-300">
          {getIcon()}
        </div>

        <div className="relative z-10 text-center space-y-2">
          <p className={`text-base font-semibold transition-colors duration-200 ${file ? "text-green-700" : isDragOver ? "text-blue-700" : "text-gray-800"}`}>
            {isDragOver ? textDropHere : file ? textReplaceFile : textUploadFile}
          </p>
          {!file && !isDragOver && <p className="text-sm text-gray-500">or drag and drop</p>}
          <p className="text-xs text-gray-400 mt-2">
            {accept.map(type => type.split('/')[1]).join(', ').toUpperCase()} • Max {maxSizeMB}MB
          </p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={accept.join(",")}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <span className="text-lg">⚠️</span>
          <span className="font-medium">{error}</span>
        </div>
      )}

      {previewUrl && (
        <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-gray-200 transition-all duration-300 hover:shadow-3xl hover:scale-[1.02] bg-white animate-in fade-in slide-in-from-bottom-4 duration-500">
          {file!.type.startsWith("image/") ? (
            <img src={previewUrl} alt="Preview" className="w-full h-64 object-cover" />
          ) : (
            <div className="flex items-center justify-center w-full h-64 bg-gradient-to-br from-gray-100 to-gray-200">
              {getFileIcon()}
            </div>
          )}

          <button
            type="button"
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-white bg-red-500 rounded-full shadow-lg hover:bg-red-600 hover:scale-110 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2"
            onClick={(e) => { e.stopPropagation(); removeFile(); }}
            aria-label="Remove file"
          >
            <span className="text-sm font-bold">✕</span>
          </button>

          <div className="p-4 bg-gradient-to-r from-gray-50 to-slate-50 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{file!.name}</p>
                <p className="text-xs text-gray-500 mt-1">{(file!.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <div className="ml-4 flex-shrink-0">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">✓ Uploaded</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
