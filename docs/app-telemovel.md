# App no telemóvel

O site é também uma **app instalável (PWA)**: ícone da Pereira & Cruz no ecrã principal, abre em ecrã inteiro,
com o mesmo login e os mesmos dados. Atualiza-se sozinha (é o próprio site). Não passa pelas lojas.

## Instalar
- **iPhone (Safari):** abrir https://pereiracruz.netlify.app → Partilhar → Adicionar ao ecrã principal.
- **Android (Chrome):** abrir o site → menu ⋮ → Instalar app (ou Adicionar ao ecrã principal).
- Também explicado em **A minha conta → App no telemóvel** (no Android aparece o botão «Instalar a app»).

## No telemóvel
- Menu no botão ☰ (canto superior esquerdo); pendentes no sino.
- Cartões uns por baixo dos outros; tabelas largas deslizam para o lado.
- Pensado para consultar e marcar: compras (encomendado/recebido), etapas dos prazos, quantidades embaladas,
  margens, pedidos e fichas. Criar encomendas, editar fichas e exportar continua mais confortável no computador.

## Técnico
- `public/manifest.webmanifest`, ícones `public/icon-*.png` e `apple-touch-icon.png` (gerados do logótipo).
- `public/sw.js`: páginas sempre da rede (sem rede abre a última versão); ficheiros `/assets/` em cache.
  Os dados (Supabase, Google) nunca ficam em cache. Registado só na versão publicada (`src/lib/app.ts`).
