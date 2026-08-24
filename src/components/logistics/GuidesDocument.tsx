import type { GuideResult } from "@/lib/logistics/types";

export function GuidesDocument({
  results,
  plate,
  addressFrom,
}: {
  results: GuideResult[];
  plate: string;
  addressFrom: string;
}) {
  const ok = results.filter((r) => r.ok);
  const reissues = ok.filter((r) => (r.version ?? 1) > 1).length;
  const date = new Date().toLocaleDateString("pt-PT");

  return (
    <article className="a4-page gc-doc gc-dense">
      <header className="gc-header">
        <div>
          <h1 className="gc-company">UP Móveis</h1>
          <p className="gc-field">Documento de Guias de Transporte Emitidas</p>
          <p className="gc-field">
            <span className="gc-label">Local de carga:</span> {addressFrom}
          </p>
        </div>
        <div className="gc-doc-id">
          <p className="gc-field">
            <span className="gc-label">Data:</span> {date}
          </p>
          <p className="gc-field">
            <span className="gc-label">Matrícula:</span> {plate}
          </p>
          <p className="gc-field">
            <span className="gc-label">Guias:</span> {ok.length}
          </p>
        </div>
      </header>

      <table className="gc-table">
        <thead>
          <tr>
            <th className="gc-left">Encomenda</th>
            <th className="gc-left">Cliente</th>
            <th className="gc-left">Guia de transporte n.º</th>
            <th className="gc-center">Via</th>
          </tr>
        </thead>
        <tbody>
          {ok.map((r) => (
            <tr key={`${r.orderId}-${r.guideId ?? r.guideNumber}`}>
              <td className="gc-left">{r.codigo}</td>
              <td className="gc-left">{r.cliente ?? ""}</td>
              <td className="gc-left">
                <strong>{r.guideNumber || (r.guideId ? `#${r.guideId}` : "—")}</strong>
              </td>
              <td className="gc-center">
                {(r.version ?? 1) > 1
                  ? `${r.version}.ª via (falta de entrega)`
                  : "1.ª via"}
              </td>
            </tr>
          ))}
          <tr>
            <td className="gc-left" colSpan={3}>
              <strong>Total de guias</strong>
            </td>
            <td className="gc-center">
              <strong>{ok.length}</strong>
            </td>
          </tr>
        </tbody>
      </table>

      {reissues > 0 && (
        <p className="gc-field">
          {reissues} guia(s) emitida(s) como nova via por falta de entrega da via anterior.
        </p>
      )}
    </article>
  );
}
