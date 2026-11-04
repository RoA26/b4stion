// Marca Bastión: escudo + nombre. `oscuro` para fondos carbón.
export default function Marca({ oscuro = false, className = '' }: { oscuro?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={oscuro ? '/marca/bastion-logo-primary.svg' : '/marca/bastion-logo-on-light.svg'}
        alt=""
        aria-hidden
        className="h-9 w-auto"
      />
      <span className="flex flex-col leading-none">
        <span className={`text-xl font-bold tracking-wide ${oscuro ? 'text-[#F4F1EA]' : 'text-tinta'}`}>Bastión</span>
        <span className={`text-[0.7rem] font-medium uppercase tracking-[0.14em] ${oscuro ? 'text-[#F4F1EA]/70' : 'text-acero'}`}>
          Inventario Poliway
        </span>
      </span>
    </span>
  );
}
