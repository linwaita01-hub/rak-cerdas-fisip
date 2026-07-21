import logo from "@/assets/logo-unlam.png.asset.json";

export function BrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <img src={logo.url} alt="Logo Universitas Lambung Mangkurat" className="h-20 w-20 object-contain" />
      <div>
        <h1 className="text-lg font-bold leading-tight text-primary">
          Perpustakaan FISIP
        </h1>
        <p className="text-xs text-muted-foreground">Universitas Lambung Mangkurat</p>
        {subtitle && <p className="mt-2 text-sm font-medium text-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}
