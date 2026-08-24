import { Fragment } from "react";
import { groupByCategory, type PickingLine } from "@/lib/logistics/picking";

export function PickingReport({
  lines,
  from,
  to,
  orders,
  byCategory = false,
}: {
  lines: PickingLine[];
  from: string;
  to: string;
  orders: number;
  byCategory?: boolean;
}) {
  const total = lines.reduce((sum, l) => sum + l.quantidade, 0);
  const groups = byCategory
    ? groupByCategory(lines)
    : [{ categoria: "", lines, quantidade: total }];

  return (
    <article className="a4-page gc-doc gc-dense">
      <header className="gc-header">
        <div>
          <h1 className="gc-company">UP Móveis</h1>
          <p className="gc-field">
            Relatório de Picking{byCategory ? " · por categoria" : ""}
          </p>
        </div>
        <div className="gc-doc-id">
          <p className="gc-field">
            <span className="gc-label">Entrega:</span> {from} a {to}
          </p>
          <p className="gc-field">
            <span className="gc-label">Encomendas:</span> {orders}
          </p>
        </div>
      </header>

      <table className="gc-table">
        <thead>
          <tr>
            <th className="gc-left">Código</th>
            <th className="gc-left">Produto</th>
            <th className="gc-left">Detalhes</th>
            <th className="gc-left">Localização</th>
            <th className="gc-left">Encomendas</th>
            <th className="gc-center gc-w-qtd">Qtd.</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.categoria || "all"}>
              {byCategory && (
                <tr>
                  <td className="gc-left" colSpan={5}>
                    <strong>{g.categoria.toUpperCase()}</strong>
                  </td>
                  <td className="gc-center">
                    <strong>{g.quantidade}</strong>
                  </td>
                </tr>
              )}
              {g.lines.map((l) => (
                <tr key={l.key}>
                  <td className="gc-left">{l.codigo}</td>
                  <td className="gc-left">{l.nome}</td>
                  <td className="gc-left">{l.detalhes}</td>
                  <td className="gc-left">{l.localizacoes ?? "—"}</td>
                  <td className="gc-left">{l.encomendas.join(", ")}</td>
                  <td className="gc-center">{l.quantidade}</td>
                </tr>
              ))}
            </Fragment>
          ))}
          <tr>
            <td className="gc-left" colSpan={5}>
              <strong>Total de artigos</strong>
            </td>
            <td className="gc-center">
              <strong>{total}</strong>
            </td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}
