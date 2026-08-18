import { useState, useMemo, useCallback } from "react";
import { Search, RefreshCw, AlertTriangle, ArrowUpDown, Tag, MapPin, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from "recharts";

// =====================================================================================
// CONFIGURAÇÃO — edite aqui
// =====================================================================================

const SHEET_ID = "1vqHBUzfiPnWxIu1Uy63AscPUiHYwAPsL";

// Cole aqui sua API Key do Google Cloud (Sheets API precisa estar habilitada no projeto)
const GOOGLE_API_KEY = "AIzaSyDefhK6jRa2_lyIy36Kb4MIblog7OU_R5s";

// Abas que existem na planilha mas NÃO são categoria de produto (ficam sempre fora do painel)
const ABAS_IGNORADAS = ["instrucoes", "instruções", "índice", "indice"];

const SHEETS_API_BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`;

// Descobre dinamicamente quais abas existem na planilha agora
async function fetchNomesDasAbas() {
  const url = `${SHEETS_API_BASE}?key=${GOOGLE_API_KEY}&fields=sheets.properties.title`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(
      body?.error?.message
        ? `Google Sheets API: ${body.error.message}`
        : `Não foi possível listar as abas (HTTP ${res.status}).`
    );
  }
  const data = await res.json();
  const todas = (data.sheets || []).map((s) => s.properties.title);
  return todas.filter((nome) => !ABAS_IGNORADAS.includes(normalize(nome)));
}

// Busca os valores (linhas x colunas) de uma aba específica
async function fetchValoresDaAba(nomeAba) {
  const url = `${SHEETS_API_BASE}/values/${encodeURIComponent(nomeAba)}?key=${GOOGLE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.values || [];
}

const PARCELAS = 12;
const DESCONTO_AVISTA = 0.10;

// Nomes de colunas aceitos (sem acento, minúsculo) para cada campo
const COLUMN_ALIASES = {
  codigo: ["codigo", "cod", "código", "sku", "ref"],
  produto: ["produto", "descricao", "descrição", "item", "nome"],
  precoUdi: [
    "preco uberlandia", "preço uberlândia", "preco udi", "vlr udi",
    "valor uberlandia", "preco uberlandia (a vista)", "uberlandia",
  ],
  precoRegional: [
    "preco regional", "preço regional", "vlr regional", "valor regional", "regional",
  ],
};

function normalize(str) {
  return String(str ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function toNumber(value) {
  if (typeof value === "number") return value;
  const n = parseFloat(String(value ?? "").replace(/[^\d,.-]/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

function formatBRL(value) {
  const num = toNumber(value);
  if (num === null) return "—";
  return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const SIZE_REGEX = /\b(queen|king\s?size|king|casal|solteiro|viuva|viúva)\b/i;
const COMPLEMENT_REGEX = /\b(box|base|ba[uú]|cabeceira)\b/i;

function extractSize(produto) {
  const m = produto.match(SIZE_REGEX);
  return m ? normalize(m[0]).replace(/\s+/g, "") : null;
}

function isMattress(produto) {
  return normalize(produto).includes("colch");
}

// Extrai {codigo, produto, precoUdi, precoRegional} de uma lista de linhas (CSV já parseado)
function parseSheet(rows) {
  let headerIdx = -1;
  let colMap = {};

  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    const found = {};
    row.forEach((cell, colIdx) => {
      const n = normalize(cell);
      for (const field of Object.keys(COLUMN_ALIASES)) {
        if (COLUMN_ALIASES[field].some((alias) => n === alias)) {
          if (found[field] === undefined) found[field] = colIdx;
        }
      }
    });
    if (found.produto !== undefined && (found.precoUdi !== undefined || found.precoRegional !== undefined)) {
      headerIdx = i;
      colMap = found;
      break;
    }
  }

  if (headerIdx === -1) return null;

  const items = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const produto = row[colMap.produto];
    const precoUdi = colMap.precoUdi !== undefined ? row[colMap.precoUdi] : "";
    const precoRegional = colMap.precoRegional !== undefined ? row[colMap.precoRegional] : "";
    if (!produto || String(produto).trim() === "") continue;
    if (precoUdi === "" && precoRegional === "") continue;
    items.push({
      codigo: colMap.codigo !== undefined ? String(row[colMap.codigo] ?? "") : "",
      produto: String(produto).trim(),
      precoUdi: toNumber(precoUdi),
      precoRegional: toNumber(precoRegional),
    });
  }
  return items.length > 0 ? items : null;
}

// =====================================================================================
// MASCOTE — dicas de vendas
// =====================================================================================

const MASCOTE_SRC = "data:image/webp;base64,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";

const DICAS = [
  { texto: "Pergunte para quem é o móvel antes de sugerir — presente pede um discurso diferente de compra pra casa própria.", tom: "dica" },
  { texto: "Sempre mostre o produto físico ou uma foto de verdade, não só o preço — cliente compra com os olhos.", tom: "dica" },
  { texto: "Cliente hesitou no preço? Mostra primeiro a opção parcelada em 12x — o valor por mês costuma parecer mais leve.", tom: "dica" },
  { texto: "Nunca comece a conversa falando de desconto — mostra o valor do produto antes do preço.", tom: "dica" },
  { texto: "Cliente indeciso entre dois modelos? Pergunta onde o móvel vai ficar em casa — isso ajuda ele a decidir.", tom: "dica" },
  { texto: "Anota o WhatsApp do cliente mesmo que não feche na hora — follow-up de 2 dias depois converte muito.", tom: "dica" },
  { texto: "Explica a garantia do produto sem o cliente perguntar — segurança fecha venda.", tom: "dica" },
  { texto: "Produto em falta? Já oferece o mais parecido na hora, não deixa o cliente sair sem alternativa.", tom: "dica" },
  { texto: "Pergunta o prazo que o cliente precisa do móvel — isso já mostra se ele está só comparando ou decidido a comprar.", tom: "dica" },
  { texto: "Fala as medidas sempre em centímetros e compara com o espaço do cliente (ex: 'cabe numa parede de 2 metros').", tom: "dica" },
  { texto: "Cliente perguntou 'tem em outra cor?' — já mostra a opção sem ele precisar insistir.", tom: "dica" },
  { texto: "Repete o nome do produto durante a conversa — ajuda o cliente a lembrar depois, na hora de decidir em casa.", tom: "dica" },
  { texto: "Cliente comparando com concorrente? Pergunta o que ele viu de diferente — geralmente é isso que falta fechar aqui.", tom: "dica" },
  { texto: "Oferece a entrega e montagem como parte da experiência, não como custo extra chato.", tom: "dica" },
  { texto: "No fim da conversa, resume o que foi combinado — preço, prazo, entrega — antes de finalizar.", tom: "dica" },
  { texto: "Cliente com criança no colo? Prioriza o atendimento, a decisão de compra costuma ser mais rápida assim.", tom: "dica" },
  { texto: "Trata reclamação de preço alto como pergunta, não como recusa — geralmente é só falta de argumento.", tom: "dica" },
  { texto: "Cliente voltou pela segunda vez pra ver o mesmo produto? Ele já decidiu, só falta um empurrãozinho.", tom: "dica" },
  { texto: "Cliente que pergunta muito sobre garantia geralmente já decidiu comprar — é só reforçar a confiança.", tom: "dica" },
  { texto: "Sorriso e 'bom dia' antes de qualquer coisa — o cliente decide em segundos se vai confiar em você.", tom: "dica" },
  { texto: "Vendeu guarda-roupa? Pergunta se falta cômoda ou criado-mudo pra combinar.", tom: "venda" },
  { texto: "Sofá vendido, já oferece almofadas ou manta — ticket médio sobe fácil com item de decoração.", tom: "venda" },
  { texto: "Colchão fechado? Sempre oferece o box e a cabeceira do mesmo tamanho antes do cliente perguntar.", tom: "venda" },
  { texto: "Mesa de jantar vendida? Pergunta se ele já tem as cadeiras ou quer ver o conjunto completo.", tom: "venda" },
  { texto: "Cliente comprando cama? Aproveita e mostra o jogo de cama, mesa e banho, já que ele tá pensando no quarto.", tom: "venda" },
  { texto: "Painel de TV vendido, já pergunta se ele precisa de suporte ou rack pra combinar.", tom: "venda" },
  { texto: "Cozinha nova? Balcão, armário e prateleira de aço costumam sair juntos — mostra o conjunto.", tom: "venda" },
  { texto: "Escrivaninha vendida pro home office? Sugere a cadeira e a prateleira junto, fecha o ambiente.", tom: "venda" },
  { texto: "Roupeiro vendido, pergunta se o quarto já tem cômoda — geralmente ele nem pensou nisso ainda.", tom: "venda" },
  { texto: "Depois do berço, sugere o guarda-roupa infantil combinando — economiza uma segunda visita do cliente.", tom: "venda" },
  { texto: "Sofá + painel + rack costuma sair como pacote de sala — monta esse combo na proposta.", tom: "venda" },
  { texto: "Aparador vendido? Pergunta se falta espelho ou luminária pra compor o ambiente.", tom: "venda" },
  { texto: "Cliente comprou base box? Mostra o colchão que combina com aquele tamanho antes dele sair.", tom: "venda" },
  { texto: "Bancada nova pra cozinha americana? Sugere os banquinhos junto, fecha o visual completo.", tom: "venda" },
  { texto: "Vendeu estante de aço? Pergunta se ele precisa de caixas organizadoras pra completar.", tom: "venda" },
  { texto: "Sempre fecha perguntando 'e pra completar o ambiente, o que mais falta?' — a resposta vira nova venda.", tom: "venda" },
  { texto: "Antes de fechar, confirma se o preço é de Uberlândia ou Regional — evita retrabalho e climão depois.", tom: "atencao" },
  { texto: "Sempre confira o estoque disponível antes de prometer prazo de entrega ao cliente.", tom: "atencao" },
  { texto: "Nunca informa preço de cabeça — confere na planilha, promoção muda de uma hora pra outra.", tom: "atencao" },
  { texto: "Produto sob encomenda tem prazo diferente — deixa isso claro antes do cliente pagar.", tom: "atencao" },
  { texto: "Confirma o CEP de entrega antes de fechar — fora da área de cobertura muda o frete.", tom: "atencao" },
  { texto: "Desconto à vista é só pra pagamento em dinheiro ou Pix — não esquece de avisar isso no cartão.", tom: "atencao" },
  { texto: "Produto com avaria ou de mostruário tem preço diferente — não vende como se fosse novo de caixa.", tom: "atencao" },
  { texto: "Sempre confirma o SKU antes de fechar, principalmente em produtos parecidos — modelo errado gera devolução.", tom: "atencao" },
  { texto: "Cliente pedindo desconto extra além dos 10%? Chama o gerente, não promete por conta própria.", tom: "atencao" },
  { texto: "Antes de finalizar, revisa se a forma de pagamento escolhida bate com o preço mostrado ao cliente.", tom: "atencao" },
  { texto: "Revisa o pedido com o cliente antes de mandar pro caixa — erro de item é o que mais gera devolução.", tom: "atencao" },
  { texto: "Bem-vindo(a) de volta! Bora bater a meta de hoje?", tom: "boasvindas" },
  { texto: "Bom dia! Já deu uma olhada nos produtos em oferta antes de abrir a loja?", tom: "boasvindas" },
  { texto: "Toda venda começa com um bom 'oi, posso ajudar?' — não deixa o cliente esperando.", tom: "boasvindas" },
  { texto: "Novo dia, nova chance de bater recorde de vendas casadas!", tom: "boasvindas" },
];

const TOM_ESTILO = {
  dica: { cor: "#F5C518", label: "DICA DE VENDA", filtro: "none" },
  venda: { cor: "#4ade80", label: "VENDA CASADA", filtro: "saturate(1.15)" },
  atencao: { cor: "#f87171", label: "ATENÇÃO", filtro: "brightness(1.05) saturate(1.1)" },
  boasvindas: { cor: "#60a5fa", label: "OLÁ", filtro: "none" },
};

function MascoteRodape() {
  const [idx, setIdx] = useState(0);
  const [visivel, setVisivel] = useState(true);

  useState(() => {
    const interval = setInterval(() => {
      setVisivel(false);
      setTimeout(() => {
        setIdx((prev) => (prev + 1) % DICAS.length);
        setVisivel(true);
      }, 250);
    }, 7000);
    return () => clearInterval(interval);
  }, []);

  const dica = DICAS[idx];
  const estilo = TOM_ESTILO[dica.tom];

  return (
    <footer className="mt-10 border-t" style={{ borderColor: "#2e2e2e", backgroundColor: "#191919" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex items-end gap-3">
        <img
          src={MASCOTE_SRC}
          alt="Mascote WL Móveis"
          className="w-20 sm:w-24 shrink-0 select-none"
          style={{
            filter: estilo.filtro,
            transition: "filter 0.4s ease",
            animation: "wl-float 3.5s ease-in-out infinite",
          }}
        />
        <div
          className="relative flex-1 rounded-2xl rounded-bl-sm px-4 py-3 border transition-opacity duration-300"
          style={{
            backgroundColor: "#1c1c1c",
            borderColor: estilo.cor,
            boxShadow: `0 0 0 1px ${estilo.cor}22`,
            opacity: visivel ? 1 : 0,
          }}
        >
          <span
            className="inline-block text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full mb-1.5"
            style={{ backgroundColor: estilo.cor, color: "#141414" }}
          >
            {estilo.label}
          </span>
          <p className="text-xs sm:text-sm leading-snug" style={{ color: "#e5e5e5" }}>
            {dica.texto}
          </p>
        </div>
      </div>
      <style>{`
        @keyframes wl-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>
    </footer>
  );
}

// =====================================================================================
// PAINEL PRINCIPAL
// =====================================================================================

export default function Dashboard() {
  const [categories, setCategories] = useState({});
  const [order, setOrder] = useState([]);
  const [activeCat, setActiveCat] = useState("__todas__");
  const [region, setRegion] = useState("udi"); // "udi" | "regional"
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState({ key: "produto", dir: 1 });
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadData = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      const nomesAbas = await fetchNomesDasAbas();

      if (nomesAbas.length === 0) {
        throw new Error("A planilha não tem nenhuma aba além das ignoradas (INSTRUÇÕES, etc).");
      }

      const results = await Promise.all(
        nomesAbas.map(async (name) => {
          try {
            const rows = await fetchValoresDaAba(name);
            if (!rows) return { name, ok: false, reason: "falha ao buscar valores" };
            const items = parseSheet(rows);
            if (!items) return { name, ok: false, reason: "sem colunas Produto/Preço reconhecidas" };
            return { name, ok: true, items };
          } catch (e) {
            return { name, ok: false, reason: e.message || "falha de rede" };
          }
        })
      );

      const parsed = {};
      const ord = [];
      const falhas = [];
      results.forEach((r) => {
        if (r.ok) {
          parsed[r.name] = r.items;
          ord.push(r.name);
        } else {
          falhas.push(`${r.name}: ${r.reason}`);
        }
      });

      if (ord.length === 0) {
        throw new Error(
          "Nenhuma aba pôde ser lida.\n" + falhas.join("\n")
        );
      }

      setCategories(parsed);
      setOrder(ord);
      setLastUpdated(new Date());
      setStatus("ready");
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Erro desconhecido ao carregar a planilha.");
      setStatus("error");
    }
  }, []);

  useState(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const priceKey = region === "udi" ? "precoUdi" : "precoRegional";

  // Todos os itens, com nome da categoria anexado
  const allItems = useMemo(() => {
    return order.flatMap((cat) => categories[cat].map((it) => ({ ...it, categoria: cat })));
  }, [order, categories]);

  const chartData = useMemo(() => {
    return order.map((cat) => ({ name: cat, total: categories[cat].length }));
  }, [order, categories]);

  const baseList = activeCat === "__todas__" ? allItems : (categories[activeCat] || []).map((it) => ({ ...it, categoria: activeCat }));

  const filtered = useMemo(() => {
    let list = baseList;
    if (search.trim()) {
      const q = normalize(search);
      list = list.filter(
        (it) => normalize(it.produto).includes(q) || normalize(it.codigo).includes(q)
      );
    }
    // só mostra itens que têm preço definido para a região escolhida
    list = list.filter((it) => it[priceKey] !== null && it[priceKey] !== undefined);

    const dir = sortBy.dir;
    return [...list].sort((a, b) => {
      if (sortBy.key === "preco") {
        return ((a[priceKey] ?? 0) - (b[priceKey] ?? 0)) * dir;
      }
      return String(a[sortBy.key] ?? "").localeCompare(String(b[sortBy.key] ?? ""), "pt-BR") * dir;
    });
  }, [baseList, search, sortBy, priceKey]);

  const toggleSort = (key) => {
    setSortBy((prev) => (prev.key === key ? { key, dir: -prev.dir } : { key, dir: 1 }));
  };

  // Sugestões complementares: dispara quando a busca encontra colchão(ões)
  const suggestions = useMemo(() => {
    if (!search.trim() || filtered.length === 0) return [];
    const colchoes = filtered.filter((it) => isMattress(it.produto));
    if (colchoes.length === 0) return [];
    const sizes = new Set(colchoes.map((it) => extractSize(it.produto)).filter(Boolean));
    if (sizes.size === 0) return [];
    const found = allItems.filter(
      (it) =>
        !isMattress(it.produto) &&
        COMPLEMENT_REGEX.test(it.produto) &&
        [...sizes].some((size) => normalize(it.produto).replace(/\s+/g, "").includes(size)) &&
        it[priceKey] !== null &&
        it[priceKey] !== undefined
    );
    const seen = new Set();
    return found.filter((it) => (seen.has(it.codigo) ? false : (seen.add(it.codigo), true)));
  }, [search, filtered, allItems, priceKey]);

  const totalProdutos = allItems.length;

  return (
    <div className="min-h-screen w-full flex flex-col" style={{ backgroundColor: "#141414" }}>
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 sm:px-6 py-3 border-b sticky top-0 z-10"
        style={{ backgroundColor: "#1c1c1c", borderColor: "#2e2e2e" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-md flex items-center justify-center font-black text-sm shrink-0"
            style={{ backgroundColor: "#F5C518", color: "#141414" }}
          >
            WL
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-none">Painel de Preços</p>
            <p className="text-xs leading-none mt-1 truncate" style={{ color: "#888" }}>
              {totalProdutos > 0 ? `${totalProdutos} produtos` : "WL Móveis"}
            </p>
          </div>
        </div>
        <button
          onClick={loadData}
          disabled={status === "loading"}
          className="p-2 rounded-lg border flex items-center gap-1.5 text-xs font-medium"
          style={{ backgroundColor: "#141414", borderColor: "#333", color: "#F5C518" }}
          title="Atualizar"
        >
          <RefreshCw size={14} className={status === "loading" ? "animate-spin" : ""} />
        </button>
      </header>

      <div className="flex-1 flex flex-col max-w-6xl w-full mx-auto p-4 sm:p-6">
        {status === "loading" && order.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20">
            <RefreshCw size={22} className="animate-spin" style={{ color: "#F5C518" }} />
            <p className="text-sm" style={{ color: "#999" }}>Carregando planilha...</p>
          </div>
        )}

        {status === "error" && (
          <div
            className="rounded-xl p-5 border flex items-start gap-3 mb-4"
            style={{ backgroundColor: "#241a1a", borderColor: "#5c2b2b" }}
          >
            <AlertTriangle size={18} style={{ color: "#f87171" }} className="shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold" style={{ color: "#f87171" }}>Erro ao carregar dados</p>
              <p className="text-xs mt-1 whitespace-pre-line" style={{ color: "#d4a5a5" }}>{errorMsg}</p>
              <button
                onClick={loadData}
                className="mt-3 text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: "#F5C518", color: "#141414" }}
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        {order.length > 0 && (
          <>
            {/* Resumo visual: produtos por categoria */}
            <div className="rounded-xl border p-4 mb-5" style={{ backgroundColor: "#1c1c1c", borderColor: "#2e2e2e" }}>
              <div className="flex items-center gap-1.5 mb-3">
                <BarChart3 size={13} style={{ color: "#F5C518" }} />
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#999" }}>
                  Produtos por categoria
                </p>
              </div>
              <ResponsiveContainer width="100%" height={Math.max(140, chartData.length * 22)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={150}
                    tick={{ fill: "#999", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={12}>
                    {chartData.map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill={entry.name === activeCat ? "#F5C518" : "#3a3a3a"}
                        cursor="pointer"
                        onClick={() => setActiveCat(entry.name === activeCat ? "__todas__" : entry.name)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Seletor de região */}
            <div className="flex items-center gap-2 mb-4">
              <MapPin size={13} style={{ color: "#888" }} />
              <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: "#333" }}>
                <button
                  onClick={() => setRegion("udi")}
                  className="px-3.5 py-1.5 text-xs font-semibold"
                  style={
                    region === "udi"
                      ? { backgroundColor: "#F5C518", color: "#141414" }
                      : { backgroundColor: "#1c1c1c", color: "#ccc" }
                  }
                >
                  Uberlândia
                </button>
                <button
                  onClick={() => setRegion("regional")}
                  className="px-3.5 py-1.5 text-xs font-semibold"
                  style={
                    region === "regional"
                      ? { backgroundColor: "#F5C518", color: "#141414" }
                      : { backgroundColor: "#1c1c1c", color: "#ccc" }
                  }
                >
                  Regional
                </button>
              </div>
              <p className="text-xs" style={{ color: "#666" }}>
                12x sem juros · à vista com 10% off
              </p>
            </div>

            {/* Categorias */}
            <div className="flex gap-2 overflow-x-auto pb-3 mb-1 -mx-1 px-1" style={{ scrollbarWidth: "thin" }}>
              <button
                onClick={() => setActiveCat("__todas__")}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border"
                style={
                  activeCat === "__todas__"
                    ? { backgroundColor: "#F5C518", color: "#141414", borderColor: "#F5C518" }
                    : { backgroundColor: "#1c1c1c", color: "#ccc", borderColor: "#333" }
                }
              >
                Todas
                <span
                  className="ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full"
                  style={
                    activeCat === "__todas__"
                      ? { backgroundColor: "#141414", color: "#F5C518" }
                      : { backgroundColor: "#2a2a2a", color: "#888" }
                  }
                >
                  {totalProdutos}
                </span>
              </button>
              {order.map((name) => (
                <button
                  key={name}
                  onClick={() => setActiveCat(name)}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border"
                  style={
                    activeCat === name
                      ? { backgroundColor: "#F5C518", color: "#141414", borderColor: "#F5C518" }
                      : { backgroundColor: "#1c1c1c", color: "#ccc", borderColor: "#333" }
                  }
                >
                  <Tag size={11} />
                  {name}
                  <span
                    className="ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full"
                    style={
                      activeCat === name
                        ? { backgroundColor: "#141414", color: "#F5C518" }
                        : { backgroundColor: "#2a2a2a", color: "#888" }
                    }
                  >
                    {categories[name].length}
                  </span>
                </button>
              ))}
            </div>

            {/* Busca */}
            <div className="relative mb-4">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#666" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou SKU..."
                className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm text-white outline-none border"
                style={{ backgroundColor: "#1c1c1c", borderColor: "#333" }}
              />
            </div>

            {/* Tabela */}
            <div className="rounded-xl border overflow-hidden overflow-x-auto" style={{ borderColor: "#2e2e2e" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: "#1c1c1c" }}>
                    <th
                      onClick={() => toggleSort("codigo")}
                      className="text-left px-4 py-3 font-semibold cursor-pointer select-none whitespace-nowrap"
                      style={{ color: "#888" }}
                    >
                      <span className="inline-flex items-center gap-1">SKU <ArrowUpDown size={11} /></span>
                    </th>
                    <th
                      onClick={() => toggleSort("produto")}
                      className="text-left px-4 py-3 font-semibold cursor-pointer select-none"
                      style={{ color: "#888" }}
                    >
                      <span className="inline-flex items-center gap-1">Produto <ArrowUpDown size={11} /></span>
                    </th>
                    {activeCat === "__todas__" && (
                      <th className="text-left px-4 py-3 font-semibold whitespace-nowrap" style={{ color: "#888" }}>
                        Categoria
                      </th>
                    )}
                    <th
                      onClick={() => toggleSort("preco")}
                      className="text-right px-4 py-3 font-semibold cursor-pointer select-none whitespace-nowrap"
                      style={{ color: "#888" }}
                    >
                      <span className="inline-flex items-center gap-1 justify-end w-full">Tabela <ArrowUpDown size={11} /></span>
                    </th>
                    <th className="text-right px-4 py-3 font-semibold whitespace-nowrap" style={{ color: "#888" }}>
                      12x sem juros
                    </th>
                    <th className="text-right px-4 py-3 font-semibold whitespace-nowrap" style={{ color: "#888" }}>
                      À vista (-10%)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it, idx) => {
                    const preco = it[priceKey];
                    return (
                      <tr
                        key={`${it.categoria}-${it.codigo}-${idx}`}
                        className="border-t"
                        style={{ borderColor: "#242424", backgroundColor: idx % 2 === 0 ? "transparent" : "#181818" }}
                      >
                        <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: "#777" }}>{it.codigo || "—"}</td>
                        <td className="px-4 py-2.5 text-white">{it.produto}</td>
                        {activeCat === "__todas__" && (
                          <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: "#888" }}>{it.categoria}</td>
                        )}
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap" style={{ color: "#F5C518" }}>
                          {formatBRL(preco)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap" style={{ color: "#ccc" }}>
                          {preco !== null ? `12x ${formatBRL(preco / PARCELAS)}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap" style={{ color: "#4ade80" }}>
                          {preco !== null ? formatBRL(preco * (1 - DESCONTO_AVISTA)) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={activeCat === "__todas__" ? 6 : 5} className="px-4 py-10 text-center text-sm" style={{ color: "#666" }}>
                        Nenhum produto encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-3 px-1">
              <p className="text-xs" style={{ color: "#666" }}>
                {filtered.length} {filtered.length === 1 ? "item" : "itens"}
              </p>
              {lastUpdated && (
                <p className="text-xs" style={{ color: "#666" }}>
                  Atualizado às {lastUpdated.toLocaleTimeString("pt-BR")}
                </p>
              )}
            </div>

            {suggestions.length > 0 && (
              <div className="mt-6 rounded-xl border p-4" style={{ backgroundColor: "#1c1c1c", borderColor: "#F5C518" }}>
                <div className="flex items-center gap-1.5 mb-3">
                  <Tag size={13} style={{ color: "#F5C518" }} />
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#F5C518" }}>
                    Complementos sugeridos
                  </p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left pb-2 font-semibold" style={{ color: "#888" }}>Produto</th>
                      <th className="text-left pb-2 font-semibold whitespace-nowrap" style={{ color: "#888" }}>Categoria</th>
                      <th className="text-right pb-2 font-semibold whitespace-nowrap" style={{ color: "#888" }}>Tabela</th>
                      <th className="text-right pb-2 font-semibold whitespace-nowrap" style={{ color: "#888" }}>À vista (-10%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.map((it, idx) => {
                      const preco = it[priceKey];
                      return (
                        <tr key={`sug-${it.codigo}-${idx}`} className="border-t" style={{ borderColor: "#2e2e2e" }}>
                          <td className="py-2 text-white">{it.produto}</td>
                          <td className="py-2 text-xs whitespace-nowrap" style={{ color: "#888" }}>{it.categoria}</td>
                          <td className="py-2 text-right font-semibold tabular-nums whitespace-nowrap" style={{ color: "#F5C518" }}>{formatBRL(preco)}</td>
                          <td className="py-2 text-right tabular-nums whitespace-nowrap" style={{ color: "#4ade80" }}>{formatBRL(preco * (1 - DESCONTO_AVISTA))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <MascoteRodape />
    </div>
  );
}
