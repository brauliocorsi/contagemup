import type { GcDocument, GcLine } from "@/lib/logistics/types";

const EMPRESA = {
  nome: "UP Móveis",
  contacto: "apoioaocliente@upmoveis.pt",
  site: "sistemaupmoveis.com",
};

function money(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value || "0,00";
  return n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function date(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <p className="gc-field">
      <span className="gc-label">{label}:</span> {value}
    </p>
  );
}

function LineTable({ title, lines }: { title: string; lines: GcLine[] }) {
  if (lines.length === 0) return null;
  return (
    <section className="gc-block">
      <h3 className="gc-section-title">{title}</h3>
      <table className="gc-table">
        <thead>
          <tr>
            <th className="gc-left gc-w-cod">Código</th>
            <th className="gc-left">Descrição</th>
            <th className="gc-center gc-w-qtd">Qtd.</th>
            <th className="gc-center gc-w-un">Un.</th>
            <th className="gc-right gc-w-val">Valor unit.</th>
            <th className="gc-right gc-w-val">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{l.codigo}</td>
              <td>
                {l.nome}
                {l.detalhes ? <div className="gc-detail">{l.detalhes}</div> : null}
              </td>
              <td className="gc-center">{l.quantidade}</td>
              <td className="gc-center">{l.unidade || "UN"}</td>
              <td className="gc-right">{money(l.valorUnitario)}</td>
              <td className="gc-right">{money(l.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function OrderDocument({ doc }: { doc: GcDocument }) {
  const lines =
    doc.produtos.length + doc.servicos.length + doc.pagamentos.length + doc.atributos.length;
  const density = lines > 30 ? "gc-xdense" : lines > 16 ? "gc-dense" : "";

  return (
    <article className={`a4-page gc-doc ${density}`}>

      <header className="gc-header">
        <div>
          <h1 className="gc-company">{EMPRESA.nome}</h1>
          <p className="gc-muted">{EMPRESA.contacto}</p>
          <p className="gc-muted">{EMPRESA.site}</p>
        </div>
        <div className="gc-doc-id">
          <h2>Pedido de Venda</h2>
          <p className="gc-code">Nº {doc.codigo}</p>
          <p>Data: {date(doc.data)}</p>
          {doc.entrega ? <p>Prazo de entrega: {date(doc.entrega)}</p> : null}
          {doc.situacao ? <p>Situação: {doc.situacao}</p> : null}
        </div>
      </header>

      <section className="gc-block">
        <h3 className="gc-section-title">Dados do cliente</h3>
        <div className="gc-grid">
          <Field label="Cliente" value={doc.cliente.nome} />
          <Field label="NIF/Documento" value={doc.cliente.documento} />
          <Field label="Telefone" value={doc.cliente.telefone} />
          <Field label="E-mail" value={doc.cliente.email} />
          <Field label="Morada" value={doc.cliente.morada} />
          <Field label="Transportadora" value={doc.transportadora} />
        </div>
      </section>

      <section className="gc-block">
        <h3 className="gc-section-title">Dados do pedido</h3>
        <div className="gc-grid">
          <Field label="Vendedor" value={doc.vendedor} />
          <Field label="Loja" value={doc.loja} />
          <Field label="Centro de custo" value={doc.centroCusto} />
          <Field label="Canal de venda" value={doc.canalVenda} />
          <Field label="Validade" value={date(doc.validade)} />
          {doc.atributos.map((a, i) => (
            <Field key={i} label={a.descricao} value={a.conteudo} />
          ))}
        </div>
      </section>

      

      <LineTable title="Produtos" lines={doc.produtos} />
      <LineTable title="Serviços" lines={doc.servicos} />

      <section className="gc-totals-wrap">
        <table className="gc-totals">
          <tbody>
            <tr>
              <td>Total de produtos</td>
              <td className="gc-right">{money(doc.valorProdutos)}</td>
            </tr>
            {Number(doc.valorServicos) > 0 ? (
              <tr>
                <td>Total de serviços</td>
                <td className="gc-right">{money(doc.valorServicos)}</td>
              </tr>
            ) : null}
            {Number(doc.valorFrete) > 0 ? (
              <tr>
                <td>Frete</td>
                <td className="gc-right">{money(doc.valorFrete)}</td>
              </tr>
            ) : null}
            {Number(doc.desconto) > 0 ? (
              <tr>
                <td>Desconto</td>
                <td className="gc-right">- {money(doc.desconto)}</td>
              </tr>
            ) : null}
            <tr className="gc-total-row">
              <td>Total</td>
              <td className="gc-right">{money(doc.valorTotal)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {doc.pagamentos.length > 0 ? (
        <section className="gc-block">
          <h3 className="gc-section-title">Pagamentos</h3>
          <table className="gc-table">
            <thead>
              <tr>
                <th className="gc-left">Vencimento</th>
                <th className="gc-left">Forma de pagamento</th>
                <th className="gc-left">Observação</th>
                <th className="gc-right gc-w-val">Valor</th>
              </tr>
            </thead>
            <tbody>
              {doc.pagamentos.map((p, i) => (
                <tr key={i}>
                  <td>{date(p.vencimento)}</td>
                  <td>{p.forma}</td>
                  <td>{p.observacao}</td>
                  <td className="gc-right">{money(p.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}


      <footer className="gc-signatures">
        <div>
          <span className="gc-line" />
          <p>{EMPRESA.nome}</p>
        </div>
        <div>
          <span className="gc-line" />
          <p>{doc.cliente.nome || "Cliente"}</p>
        </div>
      </footer>
    </article>
  );
}
