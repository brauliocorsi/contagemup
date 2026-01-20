import * as React from "react";
import { cn } from "@/lib/utils";

interface ResizableTableContextType {
  columnWidths: Record<string, number>;
  setColumnWidth: (columnId: string, width: number) => void;
  isResizing: boolean;
  setIsResizing: (resizing: boolean) => void;
}

const ResizableTableContext = React.createContext<ResizableTableContextType | null>(null);

export function useResizableTable() {
  const context = React.useContext(ResizableTableContext);
  if (!context) {
    throw new Error("useResizableTable must be used within a ResizableTableProvider");
  }
  return context;
}

interface ResizableTableProviderProps {
  children: React.ReactNode;
  defaultWidths?: Record<string, number>;
}

export function ResizableTableProvider({ children, defaultWidths = {} }: ResizableTableProviderProps) {
  const [columnWidths, setColumnWidths] = React.useState<Record<string, number>>(defaultWidths);
  const [isResizing, setIsResizing] = React.useState(false);

  const setColumnWidth = React.useCallback((columnId: string, width: number) => {
    setColumnWidths(prev => ({
      ...prev,
      [columnId]: Math.max(50, width) // Minimum width of 50px
    }));
  }, []);

  return (
    <ResizableTableContext.Provider value={{ columnWidths, setColumnWidth, isResizing, setIsResizing }}>
      {children}
    </ResizableTableContext.Provider>
  );
}

interface ResizableHeaderCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  columnId: string;
  minWidth?: number;
  children: React.ReactNode;
}

export function ResizableHeaderCell({ 
  columnId, 
  minWidth = 50, 
  children, 
  className,
  style,
  ...props 
}: ResizableHeaderCellProps) {
  const { columnWidths, setColumnWidth, setIsResizing } = useResizableTable();
  const headerRef = React.useRef<HTMLTableCellElement>(null);
  const startXRef = React.useRef<number>(0);
  const startWidthRef = React.useRef<number>(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = columnWidths[columnId] || headerRef.current?.offsetWidth || 100;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.max(minWidth, startWidthRef.current + delta);
      setColumnWidth(columnId, newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const width = columnWidths[columnId];

  return (
    <th
      ref={headerRef}
      className={cn("relative group", className)}
      style={{ 
        ...style,
        width: width ? `${width}px` : undefined,
        minWidth: width ? `${width}px` : undefined,
      }}
      {...props}
    >
      {children}
      <div
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/50 group-hover:bg-border transition-colors"
        onMouseDown={handleMouseDown}
        onClick={(e) => e.stopPropagation()}
      />
    </th>
  );
}

interface ResizableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  columnId: string;
  children: React.ReactNode;
}

export function ResizableCell({ 
  columnId, 
  children, 
  className,
  style,
  ...props 
}: ResizableCellProps) {
  const { columnWidths } = useResizableTable();
  const width = columnWidths[columnId];

  return (
    <td
      className={cn(className)}
      style={{ 
        ...style,
        width: width ? `${width}px` : undefined,
        minWidth: width ? `${width}px` : undefined,
        maxWidth: width ? `${width}px` : undefined,
      }}
      {...props}
    >
      <div className="truncate">
        {children}
      </div>
    </td>
  );
}
