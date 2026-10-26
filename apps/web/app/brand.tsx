export default function Brand({ subtitle = 'HOME CARE AGENCY' }: { subtitle?: string }) {
  return <a className="brand" href="/" aria-label="Everyday Support Services home">
    <img className="brand-mark" src="/brand-mark.svg" alt="" width="50" height="60" />
    <span className="brand-name">EVERYDAY SUPPORT<span className="brand-sub">{subtitle}</span></span>
  </a>;
}
