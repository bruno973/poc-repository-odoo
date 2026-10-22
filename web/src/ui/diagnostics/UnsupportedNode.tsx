// ui/diagnostics/UnsupportedNode.tsx — Élément de vue non pris en charge : visible, jamais supprimé.
export function UnsupportedNode({ sourceTag, reason }: { sourceTag: string; reason: string }) {
  return (
    <div className="ui-unsupported" title={reason}>
      Cette partie de l'écran n'est pas encore disponible dans Leila <small>({sourceTag})</small>
    </div>
  );
}
