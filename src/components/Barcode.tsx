import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export function Barcode({ value, height = 60, displayValue = true, className }: { value: string; height?: number; displayValue?: boolean; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        height,
        displayValue,
        fontSize: 12,
        margin: 4,
      });
    } catch (e) {
      console.error("Barcode error", e);
    }
  }, [value, height, displayValue]);
  return <svg ref={ref} className={className} />;
}
