# Modelo de Layout Premium: Sidebar Retrátil & Área de Conteúdo Principal

Este repositório contém o modelo completo, limpo e responsivo da **Sidebar** e da **Área Principal (Main Content)** exportados do seu projeto original. Ele foi reestruturado para ser modular, facilitando a integração imediata em qualquer outro projeto web (HTML/CSS/JS).

---

## 📁 Estrutura dos Arquivos Exportados

Os seguintes arquivos foram gerados na pasta `modelo-sidebar-main/`:

1. **`index.html`**: Contém a estrutura semântica do layout (Menu Lateral, Overlay para Dispositivos Móveis, Cabeçalho Superior e Área de Visualizações Dinâmicas).
2. **`style.css`**: Contém a folha de estilos contendo as variáveis de tema (Light/Dark Mode), resets, animações elegantes de fade-in e as regras de responsividade com breakpoints.
3. **`script.js`**: Gerencia toda a lógica comportamental (minimização da barra no desktop com persistência em `localStorage`, abertura da gaveta mobile com overlay, troca dinâmica de views e controle do Modo Escuro).

---

## 🚀 Como Integrar no seu Novo Projeto

Siga estes passos simples para usar este modelo no seu novo projeto:

### 1. Copiar os Arquivos
Copie a pasta `modelo-sidebar-main` (ou os três arquivos `index.html`, `style.css` e `script.js`) para a raiz do seu novo projeto.

### 2. Importar Dependências no seu HTML
Certifique-se de que a tag `<head>` do seu arquivo HTML principal contenha o link para os estilos e o script do Lucide Icons (biblioteca leve de ícones utilizada no menu):

```html
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Novo Projeto</title>
    
    <!-- Folha de estilo do layout -->
    <link rel="stylesheet" href="style.css">
    
    <!-- Dependência de Ícones (Lucide) via CDN -->
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
```

No final do `<body>`, importe o script de controle:
```html
    <!-- Script de controle da Sidebar e Tema -->
    <script src="script.js"></script>
</body>
```

### 3. Como funciona a Troca de Telas (Views)
A troca de telas funciona de maneira totalmente local e instantânea, ideal para aplicações Single Page Application (SPA).
* Cada tela possui uma tag `div` com a classe `view` e uma ID no formato `v-[NOME_DA_TELA]`.
* Exemplo:
  ```html
  <div id="v-home" class="view active">Conteúdo Dashboard</div>
  <div id="v-config" class="view">Conteúdo Configurações</div>
  ```
* Para fazer a transição, basta colocar no botão ou link do menu o seguinte evento:
  ```html
  <li onclick="carregarTela('config', this)">
      <a href="#"><i data-lucide="settings"></i> <span class="nav-text">Configurações</span></a>
  </li>
  ```
  O script desativará a visualização atual, ativará o `div` com `id="v-config"`, mudará o título no topo e fechará o menu se o usuário estiver no celular.

---

## 🌓 Como Customizar as Cores (Temas)

Todas as cores e larguras estão centralizadas sob a forma de **Variáveis CSS (Custom Properties)** no topo do arquivo `style.css`.
Para alterar a identidade visual do sistema inteiro (como a cor de destaque indigo), basta alterar as variáveis abaixo:

```css
:root {
    /* Tema Claro */
    --sidebar-bg: #ffffff;
    --main-bg: #f8faff;
    --accent-color: #6366f1; /* Cor de Destaque */
    --text-main: #64748b;
    --text-dark: #1e293b;
    --border-color: #eef2f6;
    
    /* Configuração de Larguras */
    --sidebar-width: 260px;
    --sidebar-width-minimized: 80px;
}

body.dark-mode {
    /* Tema Escuro */
    --sidebar-bg: #1e293b;
    --main-bg: #0f172a;
    --accent-color: #818cf8;
    --text-main: #94a3b8;
    --text-dark: #f1f5f9;
    --border-color: #334155;
}
```

---

## 📱 Responsividade Nativa

* **Telas > 992px (Notebooks e Monitores)**: O layout exibe a sidebar completa. Se o usuário clicar no botão superior de fechar, a sidebar colapsa para `80px` (exibindo apenas os ícones). Essa configuração é salva e se mantém mesmo se a página for recarregada.
* **Telas ≤ 992px (Tablets e Celulares)**: A sidebar se esconde completamente fora do viewport. Um botão Hamburger é exibido na barra superior. Ao clicar no Hamburger, a sidebar desliza elegantemente sob a tela acompanhada de um overlay de fundo (blur). Clicando no overlay ou escolhendo uma tela no menu, a sidebar se fecha de forma automática.
