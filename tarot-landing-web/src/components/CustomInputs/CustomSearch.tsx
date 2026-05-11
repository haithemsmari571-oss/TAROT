import { Icon } from "@iconify/react";

const CustomSearch = ({ value, onChange, placeholder = "SEARCH_FILE..." }) => {
  return (
    <div className="relative flex flex-col items-start flex-grow lg:w-64">
      {/* Dossier-style Label Header */}
      <div className="bg-white/5 border-t border-x border-white/10 px-3 py-1 flex items-center gap-2 ml-1">
        <span className="text-[8px] text-white/30 uppercase tracking-[0.2em]">Filter_Query</span>
      </div>

      {/* Input Field */}
      <div className="relative w-full">
        <Icon 
          icon="ph:magnifying-glass" 
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-white transition-colors" 
        />
        <input 
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className="w-full bg-white/5 border border-white/10 px-10 py-3 text-[10px] text-white placeholder:text-white/10 focus:border-white/40 focus:bg-white/[0.07] outline-none transition-all tracking-widest"
        />
        
       
      </div>
    </div>
  );
};

export default CustomSearch;