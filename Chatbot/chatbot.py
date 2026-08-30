# -*- coding: utf-8 -*-
"""
SUGAR CANE INTELLIGENCE
Chatbot analítico municipal da cana-de-açúcar

VERSÃO:
- Interface inspirada no ChatGPT: sem sidebar lateral
- Barra de pergunta em formato de pílula
- Barra superior fixa durante a rolagem, com nome do projeto, botão 🌱 para resetar o chat e botão de informação
- Sem seletor fixo de município: o município é identificado pela própria pergunta
- Tema claro/escuro compatível com o tema do Streamlit
- Sem gráficos/blocos vazios: gráfico só é renderizado quando há dados válidos
- Parser local robusto para perguntas comuns
- Respostas quantitativas calculadas por Python/Pandas
- LLM opcional para melhorar o storytelling
- Mensagem explícita quando a pergunta ainda não é suportada
- Ranking por ANO respeita o ano pedido
- Ranking médio só é usado quando o usuário pede média/período
- Suporte a produção, área, produtividade, chuva e temperatura
- Comparações entre municípios
- Histórico
- Crescimento/queda
- Tendência
- Correlação chuva x produtividade
- Chuva defasada
- Previsão simples
- Diagnóstico área x produtividade

EXECUÇÃO LOCAL / STREAMLIT CLOUD:
    streamlit run Chatbot/chatbot.py

Dependências:
    pip install streamlit pandas numpy scipy scikit-learn plotly statsmodels openai python-dotenv
"""

from pathlib import Path
import os
import re
import json
import unicodedata
import difflib
import warnings

import numpy as np
import pandas as pd
import streamlit as st
import plotly.express as px

# Permite usar tanto `streamlit run chatbot.py` quanto o botão
# "Run Python File" do VS Code. No segundo caso, o próprio arquivo
# inicia o servidor Streamlit em um processo filho.
try:
    _streamlit_running = st.runtime.exists()
except Exception:
    _streamlit_running = False

if __name__ == "__main__" and not _streamlit_running and os.environ.get("SUGAR_CANE_STREAMLIT_CHILD") != "1":
    import subprocess
    import sys

    env = os.environ.copy()
    env["SUGAR_CANE_STREAMLIT_CHILD"] = "1"

    app_file = str(Path(__file__).resolve())

    print("\nIniciando Sugar Cane Intelligence...")
    print("Abra o endereço exibido pelo Streamlit no navegador.\n")

    try:
        completed = subprocess.run(
            [sys.executable, "-m", "streamlit", "run", app_file],
            env=env,
        )
        code = completed.returncode if completed.returncode is not None else 0
    except KeyboardInterrupt:
        # Encerramento manual (Ctrl+C) é o fluxo normal de parada do
        # Streamlit — não é um erro, então não deve gerar traceback.
        print("\nServidor encerrado.")
        code = 0

    raise SystemExit(code)

from scipy.stats import pearsonr, spearmanr
from sklearn.linear_model import LinearRegression

warnings.filterwarnings("ignore")

try:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    HAS_STATSMODELS = True
except Exception:
    HAS_STATSMODELS = False

try:
    from openai import OpenAI
    HAS_OPENAI = True
except Exception:
    HAS_OPENAI = False

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass


# ============================================================
# CONFIGURAÇÃO
# ============================================================

st.set_page_config(
    page_title="Sugar Cane Intelligence",
    page_icon="🌱",
    layout="wide",
    initial_sidebar_state="collapsed",
)

APP_DIR = Path(__file__).resolve().parent
PROJECT_DIR = APP_DIR.parent

DATA_NAME = "PAM_cana_municipios_clima_CRU_1974_2024.csv"
DATA_ARCHIVE_NAME = f"{DATA_NAME}.zip"

# Caminhos relativos ao repositório. Assim o app roda tanto localmente
# quanto no GitHub/Streamlit Community Cloud, sem depender do OneDrive.
DATA_CANDIDATES = [
    PROJECT_DIR / "Bases" / DATA_NAME,
    # O GitHub aceita o arquivo compactado no envio pelo navegador. O Pandas
    # o descompacta automaticamente quando o app roda no Streamlit Cloud.
    PROJECT_DIR / "Bases" / DATA_ARCHIVE_NAME,
    APP_DIR / "data" / DATA_NAME,
    APP_DIR / "data" / DATA_ARCHIVE_NAME,
    PROJECT_DIR / "data" / DATA_NAME,
    PROJECT_DIR / "data" / DATA_ARCHIVE_NAME,
    APP_DIR / DATA_NAME,
    PROJECT_DIR / DATA_NAME,
]

ENV_DATA = os.getenv("SUGAR_CANE_DATA", "").strip()

if ENV_DATA:
    DATA_PATH = Path(ENV_DATA).expanduser()
else:
    DATA_PATH = next(
        (p for p in DATA_CANDIDATES if p.exists()),
        DATA_CANDIDATES[0],
    )

# Local: lê a variável de ambiente/.env. No Streamlit Cloud, lê Secrets.
# Nunca inclua a chave no código ou no repositório.
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
if not OPENAI_API_KEY:
    try:
        OPENAI_API_KEY = str(st.secrets.get("OPENAI_API_KEY", "")).strip()
    except Exception:
        pass

OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5-mini")
try:
    OPENAI_MODEL = str(st.secrets.get("OPENAI_MODEL", OPENAI_MODEL)).strip()
except Exception:
    pass


# ============================================================
# CSS
# Usa variáveis do próprio Streamlit para não quebrar
# quando o usuário troca Light / Dark.
# ============================================================

st.markdown(
    """
<style>

html, body {
    overflow-x: hidden;
}

[data-testid="stAppViewContainer"] {
    background: transparent !important;
}

[data-testid="stMain"] {
    background: transparent !important;
}

.block-container {
    max-width: 1180px !important;
    padding-top: 5.5rem !important;
    padding-bottom: 7rem !important;
    padding-left: 2rem !important;
    padding-right: 2rem !important;
}

/* Não mostrar sidebar */
section[data-testid="stSidebar"] {
    display: none !important;
}

/* ============================================================
   CABEÇALHO FIXO DO PROJETO
   Mantém o header nativo do Streamlit visível para preservar
   Deploy + menu de três pontos. O cabeçalho do projeto é apenas
   uma camada visual fixa sobre o topo e não bloqueia cliques.
   ============================================================ */
.sc-fixed-header {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    height: 64px !important;
    /*
       Precisa ficar ACIMA do header nativo do Streamlit
       (header[data-testid="stHeader"], z-index: 1000001),
       senão o fundo opaco do header nativo cobre totalmente
       o nome do projeto e ele "desaparece" em ambos os temas.
    */
    z-index: 1000010 !important;
    display: flex !important;
    align-items: center !important;
    padding: 0 22px !important;
    box-sizing: border-box !important;
    background: transparent !important;
    border-bottom: 1px solid rgba(128,128,128,.12) !important;
    pointer-events: none !important;
    transform: translateZ(0) !important;
}

.sc-fixed-brand {
    margin-left: 52px !important;
    color: var(--text-color, #172b4d) !important;
    font-size: 16px !important;
    line-height: 20px !important;
    font-weight: 700 !important;
    letter-spacing: -.2px !important;
    white-space: nowrap !important;
}

.sc-fixed-brand-sub {
    color: var(--secondary-text-color, #6b7280) !important;
    font-size: 11px !important;
    line-height: 14px !important;
    font-weight: 400 !important;
    margin-top: 1px !important;
}

/*
   NÃO escondemos nem cobrimos o header nativo do Streamlit.
   Assim, Deploy e o menu ⋮ continuam clicáveis.
*/
header[data-testid="stHeader"] {
    display: flex !important;
    visibility: visible !important;
    z-index: 1000001 !important;
}

/* O texto principal acompanha o tema ativo do Streamlit. */
.sc-fixed-brand {
    color: var(--text-color, #000000) !important;
}

.sc-fixed-brand-sub {
    color: #6b7280 !important;
}

html[data-theme="dark"] .sc-fixed-brand,
body[data-theme="dark"] .sc-fixed-brand,
[data-theme="dark"] .sc-fixed-brand {
    color: #f5f7fa !important;
}

html[data-theme="dark"] .sc-fixed-brand-sub,
body[data-theme="dark"] .sc-fixed-brand-sub,
[data-theme="dark"] .sc-fixed-brand-sub {
    color: #aeb7c4 !important;
}

@media (prefers-color-scheme: dark) {
    .sc-fixed-brand {
        color: #f5f7fa !important;
    }
    .sc-fixed-brand-sub {
        color: #aeb7c4 !important;
    }
}

/* Ícone 🌱 fixo para iniciar nova conversa. */
.st-key-reset_chat_button {
    position: fixed !important;
    top: 12px !important;
    left: 18px !important;
    z-index: 1000011 !important;
    width: 40px !important;
    height: 40px !important;
    margin: 0 !important;
    padding: 0 !important;
    pointer-events: auto !important;
}

.st-key-reset_chat_button button {
    width: 40px !important;
    height: 40px !important;
    min-height: 40px !important;
    padding: 0 !important;
    margin: 0 !important;
    border-radius: 12px !important;
    border: 1px solid rgba(128,128,128,.18) !important;
    background: color-mix(in srgb, var(--background-color, #ffffff) 88%, var(--text-color, #172b4d) 12%) !important;
    color: var(--text-color, #172b4d) !important;
    font-size: 19px !important;
    box-shadow: 0 2px 12px rgba(0,0,0,.06) !important;
}

.st-key-reset_chat_button button:hover {
    background: color-mix(in srgb, var(--background-color, #ffffff) 78%, var(--text-color, #172b4d) 22%) !important;
}

/* Info fica imediatamente após o nome do projeto, não no canto direito. */
.st-key-info_popover {
    position: fixed !important;
    top: 16px !important;
    left: 320px !important;
    z-index: 1000011 !important;
    margin: 0 !important;
    padding: 0 !important;
    pointer-events: auto !important;
    width: 22px !important;
    height: 28px !important;
}

/*
   O botão de informação é somente o ícone.
   Sem cápsula, sem fundo e sem borda.
*/
.st-key-info_popover button,
.st-key-info_popover button[kind] {
    min-width: 22px !important;
    width: 22px !important;
    height: 28px !important;
    min-height: 28px !important;
    padding: 0 !important;
    margin: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    color: var(--text-color, #000000) !important;
    font-size: 19px !important;
}

.st-key-info_popover button svg {
    fill: currentColor !important;
    color: currentColor !important;
}

html[data-theme="dark"] .st-key-info_popover button,
body[data-theme="dark"] .st-key-info_popover button,
[data-theme="dark"] .st-key-info_popover button {
    color: #f5f7fa !important;
}

@media (prefers-color-scheme: dark) {
    .st-key-info_popover button {
        color: #f5f7fa !important;
    }
}

/* Espaço para o cabeçalho fixo. */
.block-container {
    padding-top: 5.5rem !important;
}

@media (max-width: 700px) {
    .sc-fixed-brand {
        margin-left: 48px !important;
        font-size: 14px !important;
    }
    .sc-fixed-brand-sub {
        display: none !important;
    }
    .st-key-info_popover {
        left: 320px !important;
    }
}

/* Área inicial */
.sc-hero {
    text-align: center;
    margin-top: 4.5rem;
    margin-bottom: 1.8rem;
}

.sc-hero-title {
    font-size: 31px;
    font-weight: 650;
    letter-spacing: -0.8px;
    color: var(--text-color);
    margin-bottom: 7px;
}

.sc-hero-subtitle {
    color: var(--secondary-text-color);
    font-size: 15px;
}

/* Pergunta do usuário */
.sc-question {
    background: rgba(128,128,128,.08);
    border: 1px solid rgba(128,128,128,.16);
    border-radius: 18px;
    padding: 15px 18px;
    margin: 1.5rem 0 1.8rem 0;
    color: var(--text-color);
    font-size: 16px;
}

/* Sugestões */
.sc-suggestion-title {
    text-align: center;
    color: var(--secondary-text-color);
    font-size: 13px;
    margin-bottom: 10px;
}

div[data-testid="stHorizontalBlock"] div.stButton > button {
    border-radius: 14px !important;
    min-height: 58px !important;
    background: rgba(128,128,128,.06) !important;
    color: inherit !important;
    border: 1px solid rgba(128,128,128,.20) !important;
    font-size: 13px !important;
}

div[data-testid="stHorizontalBlock"] div.stButton > button:hover {
    border-color: rgba(59,130,246,.55) !important;
}

/* Resposta */
.sc-answer {
    border: 1px solid rgba(128,128,128,.18);
    background: rgba(128,128,128,.05);
    border-radius: 18px;
    padding: 20px 22px;
    margin-top: 1.2rem;
}

/* KPI */
.sc-kpi {
    border: 1px solid rgba(128,128,128,.18);
    background: rgba(128,128,128,.05);
    border-radius: 16px;
    padding: 16px 18px;
    min-height: 105px;
}

.sc-kpi-label {
    color: var(--secondary-text-color);
    font-size: 13px;
    margin-bottom: 8px;
}

.sc-kpi-value {
    color: var(--text-color);
    font-size: 25px;
    font-weight: 700;
}

/* Aviso */
.sc-limitation {
    border: 1px solid rgba(245,158,11,.35);
    background: rgba(245,158,11,.08);
    border-radius: 14px;
    padding: 14px 16px;
    margin-top: 14px;
}

/* Rodapé */
.sc-footer {
    border-top: 1px solid rgba(128,128,128,.18);
    margin-top: 4rem;
    padding-top: 18px;
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.6;
}

/* Chat input */
div[data-testid="stChatInput"] {
    border-radius: 999px !important;
}

div[data-testid="stChatInput"] > div {
    border-radius: 999px !important;
}

/* Dataframe */
[data-testid="stDataFrame"] {
    border-radius: 14px !important;
    overflow: hidden !important;
}

/* Não deixar elementos ocuparem altura desnecessária */
.stPlotlyChart {
    margin-top: 8px !important;
}

</style>
""",
    unsafe_allow_html=True,
)


# ------------------------------------------------------------
# CSS dependente do tema real do Streamlit
# ------------------------------------------------------------
# As regras acima usam `prefers-color-scheme` (tema do SISTEMA
# OPERACIONAL) e o atributo `data-theme` (que o Streamlit nunca
# define no HTML). Quando o tema do SO diverge do tema escolhido
# dentro do app, as cores saem erradas — e o `color-mix()` do fundo
# do ícone depende de variáveis CSS que o Streamlit não garante.
# Aqui usamos a mesma técnica já usada em apply_plotly_theme
# (st.get_option) para saber o tema real e aplicar cores certas,
# sempre por cima do restante.
# `theme.base` informa apenas a configuração do servidor e pode continuar
# como "light" mesmo quando o usuário escolhe o modo escuro no menu do app.
# `st.context.theme.type` reflete o tema efetivamente usado pelo navegador.
try:
    _active_theme = st.context.theme.type
except Exception:
    try:
        _active_theme = st.get_option("theme.base")
    except Exception:
        _active_theme = "light"

_IS_DARK_THEME = _active_theme == "dark"

if _IS_DARK_THEME:
    _brand_color = "#ffffff"
    _brand_sub_color = "#aeb7c4"
    _icon_bg = "#262b33"
    _icon_bg_hover = "#333a45"
    _icon_border = "rgba(255,255,255,.14)"
    _icon_color = "#f5f7fa"
    _info_color = "#ffffff"
else:
    _brand_color = "#000000"
    _brand_sub_color = "#6b7280"
    _icon_bg = "#f3f4f6"
    _icon_bg_hover = "#e5e7eb"
    _icon_border = "rgba(128,128,128,.20)"
    _icon_color = "#172b4d"
    _info_color = "#000000"

st.markdown(
    f"""
<style>
.sc-fixed-brand {{
    color: {_brand_color} !important;
}}
.sc-fixed-brand-sub {{
    color: {_brand_sub_color} !important;
}}
.st-key-reset_chat_button button {{
    background: {_icon_bg} !important;
    border: 1px solid {_icon_border} !important;
    color: {_icon_color} !important;
}}
.st-key-reset_chat_button button:hover {{
    background: {_icon_bg_hover} !important;
}}
.st-key-info_popover button,
.st-key-info_popover button[kind] {{
    color: {_info_color} !important;
}}
.st-key-info_popover button svg {{
    fill: {_info_color} !important;
    color: {_info_color} !important;
}}

/*
   A área do Streamlit expõe `color-scheme` com o tema que está ativo no
   menu do aplicativo. `light-dark()` acompanha essa troca imediatamente,
   sem depender da preferência de tema do navegador ou do sistema operacional.
*/
.sc-fixed-brand {{
    color: light-dark(#000000, #ffffff) !important;
}}
.sc-fixed-brand-sub {{
    color: light-dark(#6b7280, #aeb7c4) !important;
}}
.st-key-info_popover button,
.st-key-info_popover button[kind],
.st-key-info_popover button svg {{
    color: light-dark(#000000, #ffffff) !important;
    fill: light-dark(#000000, #ffffff) !important;
}}
.st-key-reset_chat_button button {{
    background: light-dark(#f3f4f6, #000000) !important;
    border-color: light-dark(rgba(128,128,128,.20), rgba(255,255,255,.14)) !important;
    color: light-dark(#172b4d, #f5f7fa) !important;
}}
.st-key-reset_chat_button button:hover {{
    background: light-dark(#e5e7eb, #151515) !important;
}}
</style>
""",
    unsafe_allow_html=True,
)


# ============================================================
# UTILITÁRIOS
# ============================================================

def normalize_text(value):
    value = "" if value is None else str(value)
    value = value.strip().lower()
    value = "".join(
        c
        for c in unicodedata.normalize("NFD", value)
        if unicodedata.category(c) != "Mn"
    )
    value = re.sub(r"\s+", " ", value)
    return value


def fmt_number(value, decimals=0):
    if value is None or pd.isna(value):
        return "N/D"

    value = float(value)

    if decimals == 0:
        return f"{value:,.0f}".replace(",", ".")

    return (
        f"{value:,.{decimals}f}"
        .replace(",", "X")
        .replace(".", ",")
        .replace("X", ".")
    )


def fmt_pct(value):
    if value is None or pd.isna(value):
        return "N/D"
    return f"{float(value):.2f}%".replace(".", ",")


METRICS = {
    "produção": "quantidade_produzida_t",
    "producao": "quantidade_produzida_t",
    "área": "area_colhida_ha",
    "area": "area_colhida_ha",
    "produtividade": "rendimento_medio_kg_ha",
    "rendimento": "rendimento_medio_kg_ha",
    "chuva": "precipitacao_anual_mm",
    "precipitação": "precipitacao_anual_mm",
    "precipitacao": "precipitacao_anual_mm",
    "temperatura": "temperatura_media_anual_c",
}

LABELS = {
    "quantidade_produzida_t": "Produção",
    "area_colhida_ha": "Área colhida",
    "rendimento_medio_kg_ha": "Produtividade",
    "precipitacao_anual_mm": "Precipitação",
    "temperatura_media_anual_c": "Temperatura",
}

UNITS = {
    "quantidade_produzida_t": "t",
    "area_colhida_ha": "ha",
    "rendimento_medio_kg_ha": "kg/ha",
    "precipitacao_anual_mm": "mm",
    "temperatura_media_anual_c": "°C",
}


def metric_label(metric):
    return LABELS.get(metric, metric)


def metric_unit(metric):
    return UNITS.get(metric, "")


# ============================================================
# BASE
# ============================================================

@st.cache_data(show_spinner="Carregando base...")
def load_data(path_string):
    path = Path(path_string)

    if not path.exists():
        raise FileNotFoundError(
            f"Arquivo não encontrado:\n{path}"
        )

    df = pd.read_csv(path, low_memory=False)

    df.columns = (
        df.columns
        .str.strip()
        .str.lower()
        .str.replace(" ", "_", regex=False)
    )

    required = [
        "codigo_ibge",
        "municipio",
        "uf",
        "estado",
        "ano",
        "area_colhida_ha",
        "quantidade_produzida_t",
        "rendimento_medio_kg_ha",
        "precipitacao_anual_mm",
        "temperatura_media_anual_c",
    ]

    missing = [c for c in required if c not in df.columns]

    if missing:
        raise ValueError(
            "Colunas obrigatórias ausentes: "
            + ", ".join(missing)
        )

    numeric_cols = [
        "codigo_ibge",
        "latitude",
        "longitude",
        "ano",
        "area_colhida_ha",
        "quantidade_produzida_t",
        "rendimento_medio_kg_ha",
        "precipitacao_anual_mm",
        "temperatura_media_anual_c",
        "cru_latitude",
        "cru_longitude",
    ]

    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(
                df[col],
                errors="coerce"
            )

    df["municipio"] = (
        df["municipio"]
        .astype(str)
        .str.strip()
    )

    df["uf"] = (
        df["uf"]
        .astype(str)
        .str.strip()
        .str.upper()
    )

    df["estado"] = (
        df["estado"]
        .astype(str)
        .str.strip()
    )

    df["_municipio_norm"] = (
        df["municipio"]
        .map(normalize_text)
    )

    # Proteção contra duplicidade IBGE + ano.
    # Mantém a primeira observação válida.
    df = (
        df.sort_values(
            ["codigo_ibge", "ano"]
        )
        .drop_duplicates(
            subset=["codigo_ibge", "ano"],
            keep="first"
        )
        .reset_index(drop=True)
    )

    return df


# ============================================================
# RESOLUÇÃO DE MUNICÍPIOS
# ============================================================

def municipality_catalog(df):
    return (
        df[
            [
                "municipio",
                "_municipio_norm",
                "uf",
                "estado",
                "codigo_ibge",
            ]
        ]
        .drop_duplicates(
            subset=["codigo_ibge"]
        )
        .reset_index(drop=True)
    )


def resolve_municipality(df, name):
    target = normalize_text(name)

    if not target:
        return None, []

    catalog = municipality_catalog(df)

    # Exato
    exact = catalog[
        catalog["_municipio_norm"] == target
    ]

    if len(exact) == 1:
        return exact.iloc[0]["municipio"], []

    # Nome + UF
    target_tokens = target.split()

    if len(target_tokens) >= 2:
        uf = target_tokens[-1].upper()
        base_name = " ".join(target_tokens[:-1])

        uf_match = catalog[
            (catalog["_municipio_norm"] == base_name)
            & (
                catalog["uf"].map(normalize_text)
                == normalize_text(uf)
            )
        ]

        if len(uf_match) == 1:
            return uf_match.iloc[0]["municipio"], []

    # Contém
    contains = catalog[
        catalog["_municipio_norm"].str.contains(
            re.escape(target),
            regex=True,
            na=False,
        )
    ]

    if len(contains) == 1:
        return contains.iloc[0]["municipio"], []

    # Aproximação
    choices = catalog["_municipio_norm"].tolist()

    matches = difflib.get_close_matches(
        target,
        choices,
        n=5,
        cutoff=0.78,
    )

    suggestions = []

    for match in matches:
        row = catalog[
            catalog["_municipio_norm"] == match
        ].iloc[0]

        suggestions.append(
            f"{row['municipio']} ({row['uf']})"
        )

    if matches:
        return None, suggestions

    return None, []


def extract_municipalities(df, question, catalog=None):
    """
    Detecta municípios sem depender de uma lista fixa.
    Primeiro tenta nomes de 3, 2 e 1 palavras.

    Aceita um `catalog` pré-calculado (já ordenado por tamanho de
    nome, decrescente) para evitar recalcular drop_duplicates + sort
    a cada pergunta do chat. Se não for fornecido, computa localmente
    (mantém retrocompatibilidade para quem chamar a função isolada).
    """
    q = normalize_text(question)

    if catalog is None:
        catalog = municipality_catalog(df).sort_values(
            "_municipio_norm",
            key=lambda s: s.str.len(),
            ascending=False,
        )

    candidates = []

    # catalog já deve estar ordenado por tamanho do nome (decrescente)
    # para que "campos dos goytacazes" seja escolhido antes de "campo".
    names = catalog["_municipio_norm"].tolist()
    display_names = catalog["municipio"].tolist()

    for name_norm, display_name in zip(names, display_names):
        if len(name_norm) < 4:
            continue

        pattern = rf"(?<!\w){re.escape(name_norm)}(?!\w)"

        if re.search(pattern, q):
            # O catálogo vem do nome mais longo para o mais curto. Assim,
            # depois de encontrar "Ribeirão Preto", não acrescentamos o
            # município parcial "Ribeirão" de outra UF.
            is_part_of_selected = any(
                re.search(
                    rf"(?<!\w){re.escape(name_norm)}(?!\w)",
                    selected_norm,
                )
                for selected_norm, _ in candidates
            )
            if is_part_of_selected:
                continue

            candidates.append((name_norm, display_name))

    # Remove duplicados preservando ordem.
    unique = []
    seen = set()

    for _, x in candidates:
        key = normalize_text(x)

        if key not in seen:
            seen.add(key)
            unique.append(x)

    return unique[:6]


# ============================================================
# ANOS / INTENÇÃO
# ============================================================

def extract_years(question, min_year, max_year):
    q = normalize_text(question)

    years = [
        int(x)
        for x in re.findall(r"\b(?:19|20)\d{2}\b", q)
    ]

    years = [
        y
        for y in years
        if min_year <= y <= max_year
    ]

    # "últimos 10 anos"
    m = re.search(
        r"ultimos?\s+(\d+)\s+anos?",
        q,
    )

    if m:
        n = int(m.group(1))
        return max(min_year, max_year - n + 1), max_year

    if len(years) == 1:
        year = years[0]
        year_pattern = str(year)

        # "após/depois de 2001" exclui 2001; começa em 2002.
        if re.search(
            r"(?:apos|depois de)\s+(?:o?s?\s+)?(?:anos?\s+)?" + year_pattern,
            q,
        ):
            return year + 1, max_year

        # "antes de 2006" exclui 2006; "até 2006" o inclui.
        if re.search(r"antes de\s+(?:o\s+)?(?:ano\s+)?" + year_pattern, q):
            return min_year, max(min_year, year - 1)

        if re.search(r"(?:ate|até)\s+(?:o\s+)?(?:ano\s+)?" + year_pattern, q):
            return min_year, year

        # "desde 2000" ou "a partir de 2000" inclui 2000.
        if re.search(
            r"(?:desde|a partir de|partir de)\s+" + year_pattern,
            q,
        ):
            return year, max_year

        if re.search(r"de\s+" + year_pattern + r"\s+em diante", q):
            return year, max_year

        return year, year

    if len(years) >= 2:
        return min(years[:2]), max(years[:2])

    return None, None


def detect_metric(question):
    q = normalize_text(question)

    if any(x in q for x in [
        "produtividade",
        "rendimento",
        "kg/ha",
        "kg ha",
        "rendimento medio",
        "rendimento médio",
    ]):
        return "rendimento_medio_kg_ha"

    if any(x in q for x in [
        "area colhida",
        "area plantada",
        "hectares",
        "hectare",
        "ha ",
    ]):
        return "area_colhida_ha"

    if any(x in q for x in [
        "chuva",
        "precipitacao",
        "precipitação",
        "precispitacao",  # tolera a grafia frequente "precispitação"
        "precipatacao",   # tolera a grafia frequente "precipatação"
        "precepitacao",
        "mm de chuva",
    ]):
        return "precipitacao_anual_mm"

    if "temperatura" in q:
        return "temperatura_media_anual_c"

    if any(x in q for x in [
        "producao", "produção", "quantidade produzida",
        "toneladas", "tonelada", "t de cana", "cana produzida",
    ]):
        return "quantidade_produzida_t"

    return "quantidade_produzida_t"


def detect_top_n(question):
    q = normalize_text(question)

    patterns = [
        r"\btop\s+(\d+)",
        r"\b(\d+)\s+maiores?",
        r"\b(\d+)\s+menores?",
        r"\b(\d+)\s+municipios?",
    ]

    for pattern in patterns:
        m = re.search(pattern, q)

        if m:
            n = int(m.group(1))

            if 1 <= n <= 100:
                return n

    return 10


def extract_state_filter(df, question):
    """Identifica um estado citado na pergunta e retorna nome + UF."""
    if "estado" not in df.columns or "uf" not in df.columns:
        return None

    q = normalize_text(question)
    states = (
        df[["estado", "uf"]]
        .dropna()
        .drop_duplicates()
        .assign(_estado_norm=lambda x: x["estado"].map(normalize_text))
        .sort_values("_estado_norm", key=lambda x: x.str.len(), ascending=False)
    )

    # Aceita nomes completos, como "Estado de São Paulo" ou "em Minas Gerais".
    for _, row in states.iterrows():
        state_norm = row["_estado_norm"]
        if re.search(r"(?<!\w)" + re.escape(state_norm) + r"(?!\w)", q):
            return {"estado": str(row["estado"]), "uf": str(row["uf"]).upper()}

    # Também aceita a sigla, desde que apareça como palavra isolada: "no estado SP".
    for _, row in states.iterrows():
        uf = str(row["uf"]).strip().upper()
        if re.search(r"(?<!\w)" + re.escape(uf.lower()) + r"(?!\w)", q):
            return {"estado": str(row["estado"]), "uf": uf}

    return None


def detect_intent(question, municipalities):
    q = normalize_text(question)

    # 1. Perguntas de ajuda
    if any(x in q for x in [
        "o que voce faz",
        "o que esse chat faz",
        "como funciona",
        "ajuda",
        "quais perguntas",
        "como perguntar",
    ]):
        return "help"

    # Consulta do catálogo da base.
    has_availability_word = any(x in q for x in [
        "disponivel", "disponiveis", "disponibilidade", "na base",
        "na base de dados", "cadastrado", "cadastrados", "lista",
    ])
    if ("ano" in q or "anos" in q) and has_availability_word:
        return "available_years"

    if (
        any(x in q for x in [
            "municipio", "municipios", "municpio", "municpios", "cidade", "cidades"
        ])
        and has_availability_word
    ):
        return "available_municipalities"

    # Ex.: "Qual ano Piracicaba teve a maior precipitação?"
    # Não é ranking: retorna o pico anual da série solicitada.
    if (
        "ano" in q
        and any(x in q for x in ["maior", "maxima", "máxima", "pico"])
        and any(x in q for x in [
            "qual ano", "qual o ano", "que ano", "em que ano",
        ])
    ):
        return "peak_year"

    # 2. Ranking histórico dos maiores produtores
    # Ex.: "histórico dos 5 maiores municípios produtores desde 2000"
    if (
        any(x in q for x in ["historico", "histórico", "evolucao", "evolução"])
        and any(x in q for x in [
            "maiores produtores", "maiores municipios produtores",
            "maiores municípios produtores", "maior producao", "maior produção",
            "mais produziram", "mais produtores", "ranking"
        ])
    ):
        return "ranking_history"

    # 3. Líder / maior ou menor indicador (resposta pontual)
    # Perguntas singulares retornam os KPIs do município vencedor,
    # com um ano, intervalo ou a série inteira.
    if (
        ("qual municipio teve maior" in q
         or "qual municipio tem maior" in q
         or "qual municipio tem a maior" in q
         or "qual municipio com maior" in q
         or "qual municipio com a maior" in q
         or "qual municipio possui maior" in q
         or "qual municipio apresenta maior" in q
         or "qual foi o municipio com maior" in q
         or "qual municipio teve a maior" in q
         or "qual foi o maior produtor" in q
         or "qual cidade teve maior" in q
         or "qual cidade tem maior" in q
         or "qual cidade tem a maior" in q
         or "qual cidade possui maior" in q
         or "qual cidade com maior" in q)
        and not any(x in q for x in [
            "ranking", "top ", "topo ", "10 maiores",
            "maiores produtores", "maiores municipios",
            "maiores municípios", "lista dos", "lista de"
        ])
    ):
        return "leader"

    # 4. Ranking / maior / menor
    if (
        "ranking" in q
        or "maior producao" in q
        or "maior produção" in q
        or "maior produtividade" in q
        or "maior area" in q
        or "maior precipitacao" in q
        or "menor producao" in q
        or "menor produtividade" in q
        or "maior queda" in q
        or "maior crescimento" in q
        or "mais produziram" in q
        or "maiores produtores" in q
        or "maiores municipios produtores" in q
        or "mais aumentaram" in q
        or "aumentaram a producao" in q
        or "cresceram a producao" in q
        or "municipio com maior" in q
        or "município com maior" in q
        or "cidade com maior" in q
        or "cidade que mais" in q
        or ("municipios" in q and "maior" in q)
    ):
        return "ranking"

    # 3. Comparação
    # Primeiro preservamos perguntas de clima/correlação, mesmo que
    # o nome do município contenha termos que possam gerar múltiplas
    # correspondências.
    if not (
        any(x in q for x in [
            "chuva", "precipitacao", "precipitação",
            "temperatura", "clima", "correlacao", "correlação",
            "relacao entre", "relação entre", "associacao", "associação"
        ])
        and any(x in q for x in [
            "producao", "produção", "produtividade",
            "rendimento", "area", "área"
        ])
    ):
        if (
            "compare" in q
            or "comparar" in q
            or "comparacao" in q
            or "comparação" in q
            or "versus" in q
            or " vs " in f" {q} "
            or len(municipalities) >= 2
        ):
            return "comparison"

    # 4. Clima / correlação
    # Aceita perguntas sobre chuva/precipitação ou temperatura
    # relacionadas a produção, produtividade, área ou simplesmente "clima".
    climate_words = [
        "chuva", "precipitacao", "precipitação",
        "temperatura", "clima", "tempo"
    ]
    relation_words = [
        "correlacao", "correlação",
        "relacao", "relação",
        "associacao", "associação",
        "relacionada", "relacionado",
        "relaciona", "relacao entre", "relação entre",
        "tem relacao", "tem relação", "existe relacao", "existe relação"
    ]
    agricultural_words = [
        "producao", "produção", "produtividade",
        "rendimento", "area", "área", "cana"
    ]

    has_climate = any(x in q for x in climate_words)
    has_relation = any(x in q for x in relation_words)
    has_agricultural = any(x in q for x in agricultural_words)

    if (
        (has_climate and has_relation)
        or (has_climate and has_agricultural and (
            " e " in q or " x " in q or "entre" in q
        ))
        or "chuva e producao" in q
        or "chuva e produção" in q
        or "chuva e produtividade" in q
        or "temperatura e producao" in q
        or "temperatura e produção" in q
        or "temperatura e produtividade" in q
        or "clima e producao" in q
        or "clima e produção" in q
        or "clima e produtividade" in q
    ):
        return "climate"

    # 5. Defasagem
    if (
        "defasagem" in q
        or "ano anterior" in q
        or "chuva anterior" in q
        or "lag" in q
    ):
        return "lag"

    # 6. Previsão
    if (
        "previsao" in q
        or "previsão" in q
        or "projecao" in q
        or "projeção" in q
        or "estime" in q
        or "estimar" in q
        or "quanto vai produzir" in q
    ):
        return "forecast"

    # 7. Diagnóstico
    if (
        "diagnostico" in q
        or "diagnóstico" in q
        or "o que explica" in q
        or "explica a evolucao" in q
        or "explica a evolução" in q
    ):
        return "diagnostic"

    # 8. Tendência
    if (
        "tendencia" in q
        or "tendência" in q
        or "crescendo" in q
        or "cresce" in q
        or "diminuindo" in q
        or "caindo" in q
        or "evoluiu" in q
        or "evolucao" in q
        or "evolução" in q
        or "historico" in q
        or "histórico" in q
    ):
        return "history"

    # 9. Pergunta pontual
    if (
        "qual foi" in q
        or "quanto foi" in q
        or "qual a" in q
        or "qual o" in q
        or "quanto produziu" in q
        or "quanto choveu" in q
        or "qual temperatura" in q
    ):
        return "point"

    # 10. Se tem município, perfil
    if municipalities:
        return "profile"

    return "unsupported"


def build_intent(
    df,
    question,
    default_start,
    default_end,
    catalog=None,
):
    min_year = int(df["ano"].min())
    max_year = int(df["ano"].max())

    municipalities = extract_municipalities(
        df,
        question,
        catalog=catalog,
    )

    inicio, fim = extract_years(
        question,
        min_year,
        max_year,
    )

    if inicio is None:
        inicio = default_start

    if fim is None:
        fim = default_end

    metric = detect_metric(question)
    state_filter = extract_state_filter(df, question)
    intent = detect_intent(
        question,
        municipalities,
    )

    return {
        "intent": intent,
        "municipios": municipalities,
        "inicio": int(inicio),
        "fim": int(fim),
        "metrica": metric,
        "top_n": detect_top_n(question),
        "estado": state_filter,
    }


# ============================================================
# DADOS / CÁLCULOS
# ============================================================

def filter_period(df, start, end):
    return df[
        (df["ano"] >= start)
        & (df["ano"] <= end)
    ].copy()


def get_municipality_data(
    df,
    municipality,
    start,
    end,
):
    data = df[
        (df["municipio"] == municipality)
        & (df["ano"] >= start)
        & (df["ano"] <= end)
    ].copy()

    return data.sort_values("ano")


def growth_pct(first, last):
    if (
        first is None
        or last is None
        or pd.isna(first)
        or pd.isna(last)
        or float(first) == 0
    ):
        return np.nan

    return (
        (float(last) / float(first)) - 1
    ) * 100


def calculate_trend(data, metric):
    if data.empty or metric not in data.columns:
        return None

    d = data[
        ["ano", metric]
    ].dropna().copy()

    if len(d) < 2:
        return None

    x = d[["ano"]].values
    y = d[metric].values

    model = LinearRegression()
    model.fit(x, y)

    r2 = model.score(x, y)
    slope = float(model.coef_[0])

    if abs(slope) < 1e-12:
        direction = "estável"
    elif slope > 0:
        direction = "crescimento"
    else:
        direction = "queda"

    return {
        "direction": direction,
        "slope": slope,
        "r2": float(r2),
        "n": len(d),
    }


def calculate_cagr(data, metric):
    if data.empty or metric not in data.columns:
        return np.nan

    d = data[
        ["ano", metric]
    ].dropna().sort_values("ano")

    if len(d) < 2:
        return np.nan

    first = float(d.iloc[0][metric])
    last = float(d.iloc[-1][metric])
    years = int(d.iloc[-1]["ano"] - d.iloc[0]["ano"])

    if first <= 0 or last < 0 or years <= 0:
        return np.nan

    return (
        ((last / first) ** (1 / years)) - 1
    ) * 100


def correlation_analysis(
    data,
    x_col,
    y_col,
):
    d = data[
        [x_col, y_col, "ano"]
    ].dropna().copy()

    if len(d) < 3:
        return None

    if d[x_col].nunique() < 2:
        return None

    if d[y_col].nunique() < 2:
        return None

    pearson = pearsonr(
        d[x_col],
        d[y_col],
    )

    spearman = spearmanr(
        d[x_col],
        d[y_col],
    )

    return {
        "n": len(d),
        "pearson": float(pearson.statistic),
        "pearson_p": float(pearson.pvalue),
        "spearman": float(spearman.statistic),
        "spearman_p": float(spearman.pvalue),
        "data": d,
    }


def lagged_correlation(
    data,
    climate_col,
    agricultural_col,
    lag=1,
):
    d = data[
        [
            "ano",
            climate_col,
            agricultural_col,
        ]
    ].dropna().sort_values("ano")

    if len(d) < lag + 4:
        return None

    d["clima_lag"] = (
        d[climate_col].shift(lag)
    )

    d = d.dropna(
        subset=[
            "clima_lag",
            agricultural_col,
        ]
    )

    if len(d) < 3:
        return None

    if (
        d["clima_lag"].nunique() < 2
        or d[agricultural_col].nunique() < 2
    ):
        return None

    r, p = pearsonr(
        d["clima_lag"],
        d[agricultural_col],
    )

    return {
        "n": len(d),
        "r": float(r),
        "p": float(p),
        "data": d,
    }


def ranking_by_year(
    df,
    metric,
    year,
    top_n=10,
    ascending=False,
):
    d = df[
        df["ano"] == year
    ].copy()

    d = d.dropna(
        subset=[metric]
    )

    if d.empty:
        return pd.DataFrame()

    # Município + UF + IBGE evita mistura de nomes.
    group_cols = [
        "codigo_ibge",
        "municipio",
        "uf",
        metric,
    ]

    d = d[group_cols].copy()

    d = (
        d.sort_values(
            metric,
            ascending=ascending,
        )
        .head(top_n)
        .reset_index(drop=True)
    )

    d.insert(
        0,
        "ranking",
        np.arange(1, len(d) + 1),
    )

    return d


def ranking_period(
    df,
    metric,
    start,
    end,
    top_n=10,
    ascending=False,
    mode="mean",
):
    d = filter_period(
        df,
        start,
        end,
    )

    if d.empty:
        return pd.DataFrame()

    if mode == "sum":
        agg = (
            d.groupby(
                [
                    "codigo_ibge",
                    "municipio",
                    "uf",
                ],
                as_index=False,
            )[metric]
            .sum(min_count=1)
        )
    elif mode == "max":
        agg = (
            d.groupby(
                [
                    "codigo_ibge",
                    "municipio",
                    "uf",
                ],
                as_index=False,
            )[metric]
            .max()
        )
    else:
        agg = (
            d.groupby(
                [
                    "codigo_ibge",
                    "municipio",
                    "uf",
                ],
                as_index=False,
            )[metric]
            .mean()
        )

    agg = agg.dropna(
        subset=[metric]
    )

    agg = (
        agg.sort_values(
            metric,
            ascending=ascending,
        )
        .head(top_n)
        .reset_index(drop=True)
    )

    agg.insert(
        0,
        "ranking",
        np.arange(1, len(agg) + 1),
    )

    return agg


def ranking_history(df, metric, start, end, top_n=5):
    """
    Seleciona os Top N municípios pelo desempenho médio no período
    e devolve toda a série histórica desses municípios.
    Útil para perguntas como:
    "histórico desde 2000 dos 5 maiores produtores".
    """
    base = filter_period(df, start, end)
    if base.empty or metric not in base.columns:
        return pd.DataFrame()

    ranking = (
        base.groupby(["codigo_ibge", "municipio", "uf"], as_index=False)[metric]
        .mean()
        .dropna(subset=[metric])
        .sort_values(metric, ascending=False)
        .head(top_n)
    )

    if ranking.empty:
        return pd.DataFrame()

    codes = ranking["codigo_ibge"].tolist()
    top = base[base["codigo_ibge"].isin(codes)].copy()
    top = top[["codigo_ibge", "municipio", "uf", "ano", metric]].dropna(subset=[metric])

    order = {code: i + 1 for i, code in enumerate(ranking["codigo_ibge"])}
    top["ranking"] = top["codigo_ibge"].map(order)
    top["municipio_plot"] = top["municipio"] + " (" + top["uf"] + ")"
    return top.sort_values(["ranking", "ano"]).reset_index(drop=True)


def ranking_growth(
    df,
    metric,
    start,
    end,
    top_n=10,
    ascending=False,
):
    rows = []

    d = filter_period(
        df,
        start,
        end,
    )

    for code, group in d.groupby(
        "codigo_ibge"
    ):
        group = (
            group[
                [
                    "codigo_ibge",
                    "municipio",
                    "uf",
                    "ano",
                    metric,
                ]
            ]
            .dropna(
                subset=[metric]
            )
            .sort_values("ano")
        )

        if len(group) < 2:
            continue

        first = group.iloc[0][metric]
        last = group.iloc[-1][metric]

        growth = growth_pct(
            first,
            last,
        )

        if pd.isna(growth):
            continue

        rows.append(
            {
                "codigo_ibge": code,
                "municipio": group.iloc[0]["municipio"],
                "uf": group.iloc[0]["uf"],
                "inicial": first,
                "final": last,
                "crescimento_%": growth,
            }
        )

    result = pd.DataFrame(rows)

    if result.empty:
        return result

    result = (
        result.sort_values(
            "crescimento_%",
            ascending=ascending,
        )
        .head(top_n)
        .reset_index(drop=True)
    )

    result.insert(
        0,
        "ranking",
        np.arange(1, len(result) + 1),
    )

    return result


def forecast_series(
    data,
    metric,
    target_year,
):
    d = data[
        ["ano", metric]
    ].dropna().sort_values("ano")

    if len(d) < 3:
        return None

    last_year = int(d["ano"].max())

    if target_year <= last_year:
        return None

    years = d["ano"].astype(int).values
    values = d[metric].astype(float).values

    horizon = target_year - last_year

    # Naive
    naive_value = values[-1]

    candidates = []

    # Linear
    model = LinearRegression()
    model.fit(
        years.reshape(-1, 1),
        values,
    )

    linear_pred = model.predict(
        np.arange(
            last_year + 1,
            target_year + 1,
        ).reshape(-1, 1)
    )

    candidates.append(
        (
            "Tendência linear",
            linear_pred,
        )
    )

    # Holt
    if HAS_STATSMODELS and len(values) >= 5:
        try:
            holt = ExponentialSmoothing(
                values,
                trend="add",
                damped_trend=True,
                initialization_method="estimated",
            ).fit(
                optimized=True
            )

            holt_pred = holt.forecast(
                horizon
            )

            candidates.append(
                (
                    "Exponential Smoothing",
                    np.asarray(holt_pred),
                )
            )
        except Exception:
            pass

    # Validação simples: compara erro em holdout.
    best_name = "Naive"
    best_future = np.repeat(
        naive_value,
        horizon,
    )

    if len(values) >= 6:
        test_size = max(
            2,
            int(len(values) * 0.2),
        )

        train = values[:-test_size]
        test = values[-test_size:]

        scores = {
            "Naive": float(
                np.mean(
                    (test - train[-1]) ** 2
                )
            )
        }

        # Linear holdout
        try:
            x_train = years[:-test_size]
            model_test = LinearRegression()
            model_test.fit(
                x_train.reshape(-1, 1),
                train,
            )

            pred_test = model_test.predict(
                years[-test_size:].reshape(-1, 1)
            )

            scores["Tendência linear"] = float(
                np.mean(
                    (test - pred_test) ** 2
                )
            )
        except Exception:
            pass

        # Holt holdout
        if HAS_STATSMODELS and len(train) >= 5:
            try:
                h = ExponentialSmoothing(
                    train,
                    trend="add",
                    damped_trend=True,
                    initialization_method="estimated",
                ).fit()

                pred = h.forecast(
                    test_size
                )

                scores[
                    "Exponential Smoothing"
                ] = float(
                    np.mean(
                        (test - pred) ** 2
                    )
                )
            except Exception:
                pass

        best_name = min(
            scores,
            key=scores.get,
        )

        if best_name == "Naive":
            best_future = np.repeat(
                naive_value,
                horizon,
            )

        elif best_name == "Tendência linear":
            best_future = linear_pred

        elif best_name == "Exponential Smoothing":
            best_future = next(
                pred
                for name, pred in candidates
                if name == best_name
            )

    else:
        # Poucos dados: baseline conservador.
        best_name = "Naive"
        best_future = np.repeat(
            naive_value,
            horizon,
        )

    history = pd.DataFrame(
        {
            "ano": years,
            "valor": values,
            "tipo": "Observado",
        }
    )

    future = pd.DataFrame(
        {
            "ano": np.arange(
                last_year + 1,
                target_year + 1,
            ),
            "valor": best_future,
            "tipo": "Projetado",
        }
    )

    full = pd.concat(
        [history, future],
        ignore_index=True,
    )

    return {
        "modelo": best_name,
        "ultimo_ano": last_year,
        "target_year": target_year,
        "previsao": float(
            best_future[-1]
        ),
        "data": full,
    }


# ============================================================
# GRÁFICOS
# ============================================================

def valid_plot_data(data, columns):
    if data is None or data.empty:
        return None

    missing = [
        c for c in columns
        if c not in data.columns
    ]

    if missing:
        return None

    d = data[columns].copy()

    for c in columns:
        if c != "tipo" and c != "municipio":
            d[c] = pd.to_numeric(
                d[c],
                errors="coerce",
            )

    d = d.dropna(
        subset=[
            c for c in columns
            if c not in ["tipo", "municipio"]
        ]
    )

    if d.empty:
        return None

    return d


# ============================================================
# TEMA DOS GRÁFICOS
# ============================================================

def apply_plotly_theme(fig):
    """Adapta o gráfico ao tema configurado no Streamlit."""
    if fig is None:
        return None

    try:
        base = st.get_option("theme.base")
    except Exception:
        base = None

    # Tema transparente: o Streamlit controla o fundo.
    # Isso evita gráficos pretos no Light e gráficos brancos
    # no Dark. O template só define tipografia/eixos.
    template = "plotly_dark" if base == "dark" else "plotly_white"

    fig.update_layout(
        template=template,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(
            family="Arial, sans-serif",
            size=13,
        ),
    )

    return fig


def plot_history(data, metric, municipality):
    d = valid_plot_data(
        data,
        ["ano", metric],
    )

    if d is None:
        return None

    fig = px.line(
        d,
        x="ano",
        y=metric,
        markers=True,
        title=(
            f"{metric_label(metric)} — "
            f"{municipality}"
        ),
    )

    fig.update_layout(
        xaxis_title="Ano",
        yaxis_title=(
            f"{metric_label(metric)}"
            f" ({metric_unit(metric)})"
        ),
        hovermode="x unified",
        height=430,
        margin=dict(
            l=50,
            r=30,
            t=60,
            b=50,
        ),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
    )

    return apply_plotly_theme(fig)


def plot_comparison(data, metric):
    d = valid_plot_data(
        data,
        ["ano", "municipio", metric],
    )

    if d is None:
        return None

    if d["ano"].nunique() == 1:
        fig = px.bar(
            d,
            x="municipio",
            y=metric,
            color="municipio",
            title=f"Comparação em {int(d['ano'].iloc[0])} — {metric_label(metric)}",
        )
        fig.update_layout(
            xaxis_title="Município",
            showlegend=False,
        )
    else:
        fig = px.line(
            d,
            x="ano",
            y=metric,
            color="municipio",
            markers=True,
            title=f"Comparação — {metric_label(metric)}",
        )

        # Linha de tendência linear: usa a mesma cor da série, porém mais
        # clara e tracejada para não competir com os dados observados.
        trace_colors = {
            str(trace.name): (trace.line.color or trace.marker.color)
            for trace in fig.data
        }

        for municipality, group in d.groupby("municipio"):
            series = group[["ano", metric]].dropna().sort_values("ano")

            if len(series) < 2 or series["ano"].nunique() < 2:
                continue

            slope, intercept = np.polyfit(
                series["ano"].astype(float),
                series[metric].astype(float),
                1,
            )
            trend_values = slope * series["ano"].astype(float) + intercept

            fig.add_scatter(
                x=series["ano"],
                y=trend_values,
                mode="lines",
                name=f"Tendência — {municipality}",
                line=dict(
                    color=trace_colors.get(str(municipality)),
                    dash="dash",
                    width=2,
                ),
                opacity=0.38,
                hovertemplate=(
                    f"Tendência — {municipality}<br>Ano=%{{x}}<br>"
                    f"{metric_label(metric)}=%{{y:.2f}}<extra></extra>"
                ),
            )

        fig.update_layout(
            xaxis_title="Ano",
            hovermode="x unified",
        )

    fig.update_layout(
        yaxis_title=(
            f"{metric_label(metric)}"
            f" ({metric_unit(metric)})"
        ),
        height=450,
        margin=dict(
            l=50,
            r=30,
            t=60,
            b=50,
        ),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
    )

    return apply_plotly_theme(fig)


def plot_ranking(table, metric, value_col=None):
    if table is None or table.empty:
        return None

    if value_col is None:
        value_col = metric

    if value_col not in table.columns:
        return None

    d = table.copy()

    d[value_col] = pd.to_numeric(
        d[value_col],
        errors="coerce",
    )

    d = d.dropna(
        subset=[value_col]
    )

    if d.empty:
        return None

    d["local"] = (
        d["municipio"].astype(str)
        + " ("
        + d["uf"].astype(str)
        + ")"
    )

    d = d.sort_values(
        value_col,
        ascending=True,
    )

    fig = px.bar(
        d,
        x=value_col,
        y="local",
        orientation="h",
        text=value_col,
        title=f"Ranking — {metric_label(metric)}",
    )

    fig.update_traces(
        textposition="outside",
        cliponaxis=False,
        texttemplate="%{x:,.0f}",
    )

    fig.update_layout(
        xaxis_title=(
            "Variação (%)"
            if value_col == "crescimento_%"
            else (
                f"{metric_label(metric)}"
                f" ({metric_unit(metric)})"
            )
        ),
        yaxis_title="Município",
        height=max(
            430,
            38 * len(d),
        ),
        margin=dict(
            l=10,
            r=80,
            t=60,
            b=50,
        ),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
    )

    return apply_plotly_theme(fig)


def plot_historical_ranking(data, metric):
    """Gráfico da evolução anual dos Top N municípios selecionados."""
    if data is None or data.empty or metric not in data.columns:
        return None

    required = ["ano", "municipio_plot", metric]
    if any(c not in data.columns for c in required):
        return None

    d = data[required].copy()
    d["ano"] = pd.to_numeric(d["ano"], errors="coerce")
    d[metric] = pd.to_numeric(d[metric], errors="coerce")
    d = d.dropna(subset=["ano", "municipio_plot", metric])

    if d.empty:
        return None

    fig = px.line(
        d.sort_values(["municipio_plot", "ano"]),
        x="ano",
        y=metric,
        color="municipio_plot",
        markers=True,
        title=f"Evolução histórica — Top municípios por {metric_label(metric).lower()}",
    )

    fig.update_layout(
        xaxis_title="Ano",
        yaxis_title=f"{metric_label(metric)} ({metric_unit(metric)})",
        hovermode="x unified",
        height=max(460, 120 + 45 * d["municipio_plot"].nunique()),
        margin=dict(l=50, r=30, t=65, b=50),
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
    )

    return apply_plotly_theme(fig)


def plot_climate(data, climate_col="precipitacao_anual_mm",
                agricultural_col="rendimento_medio_kg_ha",
                climate_label=None, agricultural_label=None):
    required = [climate_col, agricultural_col, "ano"]
    d = valid_plot_data(data, required)

    if d is None or len(d) < 3:
        return None

    climate_label = climate_label or metric_label(climate_col)
    agricultural_label = agricultural_label or metric_label(agricultural_col)

    fig = px.scatter(
        d,
        x=climate_col,
        y=agricultural_col,
        hover_data=["ano"],
        trendline="ols",
        title=f"{climate_label} × {agricultural_label}",
    )

    fig.update_layout(
        xaxis_title=f"{climate_label} ({metric_unit(climate_col)})",
        yaxis_title=f"{agricultural_label} ({metric_unit(agricultural_col)})",
        height=450,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
    )

    return apply_plotly_theme(fig)

def plot_forecast(forecast):
    if forecast is None:
        return None

    d = forecast["data"]

    if d.empty:
        return None

    fig = px.line(
        d,
        x="ano",
        y="valor",
        color="tipo",
        markers=True,
        title="Histórico e projeção",
    )

    fig.update_layout(
        xaxis_title="Ano",
        yaxis_title="Valor",
        hovermode="x unified",
        height=450,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
    )

    return apply_plotly_theme(fig)


def render_chart(fig):
    if fig is None:
        return False

    if not getattr(fig, "data", None):
        return False

    try:
        st.plotly_chart(
            fig,
            width='stretch',
        )
        return True
    except Exception:
        return False


# ============================================================
# STORIES
# ============================================================

def unsupported_message(question, intent_data):
    return (
        "Ainda não consigo responder essa pergunta com segurança "
        "a partir da base disponível. Estou sendo aprimorado para "
        "entender mais tipos de perguntas.\n\n"
        "Enquanto isso, tente uma pergunta como:\n"
        "- Qual município teve maior produção em 2010?\n"
        "- Quais foram os 10 maiores produtores em 2024?\n"
        "- Compare Piracicaba e Ribeirão Preto entre 2010 e 2024.\n"
        "- Como evoluiu a produtividade de Piracicaba?\n"
        "- Qual foi a chuva de Piracicaba em 2020?\n"
        "- Existe relação entre chuva e produtividade em Piracicaba?\n"
        "- Qual a projeção de produção de Piracicaba para 2030?\n"
        "- Mostre o histórico dos 5 maiores produtores desde 2000.\n"
        "- Quais municípios mais aumentaram a produtividade nos últimos 10 anos?\n"
        "- Qual município teve a maior queda de produção entre 2010 e 2024?\n"
        "- Qual foi a área colhida de Piracicaba em 2020?"
    )


def help_text():
    return """
### 🌱 O que o Sugar Cane Intelligence faz?

Este chatbot analisa dados municipais da cana-de-açúcar e do clima
e transforma perguntas em linguagem natural em análises quantitativas.

**Você pode perguntar sobre:**

- Produção
- Área colhida
- Produtividade
- Precipitação
- Temperatura
- Histórico
- Crescimento e queda
- Ranking de municípios
- Comparação entre municípios
- Tendência
- Correlação entre chuva e produtividade
- Chuva do ano anterior
- Projeções futuras
- Diagnóstico da evolução da produção

**Exemplos:**

> Qual município teve maior produção em 2010?

> Mostre os 10 maiores produtores em 2024.

> Compare Piracicaba e Ribeirão Preto entre 2010 e 2024.

> Como evoluiu a produtividade de Piracicaba?

> Qual foi a precipitação de Piracicaba em 2020?

> Existe associação entre chuva e produtividade em Piracicaba?

> A chuva do ano anterior está relacionada à produtividade?

> Qual a projeção de produção de Piracicaba para 2030?

**Importante:** os cálculos são feitos a partir da base carregada.
Previsões são estimativas, e correlação não significa causalidade.
"""


def story_leader(result):
    municipality = result.get("municipio", "Município")
    uf = result.get("uf", "")
    year = result.get("year")
    metric = result.get("metric")
    value = result.get("value")

    location = f"{municipality} ({uf})" if uf else municipality
    direction = "menor" if result.get("ascending") else "maior"

    if result.get("aggregation_description"):
        return (
            f"Entre **{result['period_start']} e {result['period_end']}**, o município com "
            f"**{direction} {result['aggregation_description']}** foi **{location}**, "
            f"com **{fmt_number(value)} {metric_unit(metric)}**."
        )

    return (
        f"Em **{year}**, o município com **{direction} {metric_label(metric).lower()}** "
        f"foi **{location}**, com **{fmt_number(value)} {metric_unit(metric)}**."
    )


def story_point(result):
    d = result["data"]
    municipality = result["municipio"]
    metric = result["metric"]
    year = result["year"]

    row = d[
        d["ano"] == year
    ]

    if row.empty:
        return (
            f"Não encontrei dados disponíveis para "
            f"{municipality} em {year}."
        )

    value = row.iloc[0][metric]

    if pd.isna(value):
        return (
            f"Há registro para {municipality} em {year}, "
            f"mas o indicador de {metric_label(metric).lower()} "
            "está sem valor."
        )

    return (
        f"Em **{year}**, {municipality} registrou "
        f"**{fmt_number(value)} {metric_unit(metric)}** "
        f"de {metric_label(metric).lower()}."
    )


def story_history(result):
    d = result["data"]
    municipality = result["municipio"]
    metric = result["metric"]

    clean = d[
        ["ano", metric]
    ].dropna().sort_values("ano")

    if clean.empty:
        return (
            f"Não encontrei dados suficientes para "
            f"analisar {municipality}."
        )

    first = clean.iloc[0]
    last = clean.iloc[-1]
    avg = clean[metric].mean()

    growth = growth_pct(
        first[metric],
        last[metric],
    )

    trend = calculate_trend(
        clean,
        metric,
    )

    direction = (
        trend["direction"]
        if trend
        else "indefinida"
    )

    return (
        f"Entre **{int(first['ano'])} e {int(last['ano'])}**, "
        f"{municipality} apresentou média de "
        f"**{fmt_number(avg)} {metric_unit(metric)}** "
        f"em {metric_label(metric).lower()}. "
        f"O valor passou de **{fmt_number(first[metric])}** "
        f"para **{fmt_number(last[metric])}**, "
        f"uma variação de **{fmt_pct(growth)}**. "
        f"A tendência linear indica **{direction}**."
    )


def story_comparison(result):
    """
    Gera a narrativa da comparação sem assumir que todas as colunas
    auxiliares existem na tabela. Isso evita KeyError em comparações
    quando a tabela foi construída apenas com município, início, final
    e crescimento.
    """
    table = result.get("table", pd.DataFrame())

    if table is None or table.empty:
        return (
            "Não encontrei dados suficientes para realizar "
            "a comparação solicitada."
        )

    # Para dois municípios, compara a média de toda a série solicitada,
    # evitando conclusões baseadas somente no último ano.
    if len(table) == 2 and "media" in table.columns:
        pair = table.dropna(subset=["media"]).copy()

        if len(pair) == 2:
            pair = pair.sort_values("media", ascending=False).reset_index(drop=True)
            higher = pair.iloc[0]
            lower = pair.iloc[1]
            higher_value = float(higher["media"])
            lower_value = float(lower["media"])

            higher_name = f"{higher['municipio']} ({higher.get('uf', '')})".strip()
            lower_name = f"{lower['municipio']} ({lower.get('uf', '')})".strip()
            metric = result.get("metric")
            metric_name = {
                "quantidade_produzida_t": "produção",
                "area_colhida_ha": "área colhida",
                "rendimento_medio_kg_ha": "produtividade",
                "precipitacao_anual_mm": "precipitação",
                "temperatura_media_anual_c": "temperatura média",
            }.get(metric, metric_label(metric).lower())
            unit = metric_unit(metric)

            if lower_value == 0:
                comparison = "não é possível calcular o percentual porque o valor de referência é zero"
            else:
                difference_pct = ((higher_value / lower_value) - 1) * 100
                comparison = f"**{fmt_pct(difference_pct)} maior** que"

            period_text = (
                f"Em **{result['fim']}**"
                if result.get("inicio") == result.get("fim")
                else f"Na média histórica de **{result.get('inicio')} a {result.get('fim')}**"
            )

            trend_higher = higher.get("tendencia", "sem tendência definida")
            trend_lower = lower.get("tendencia", "sem tendência definida")
            trend_text = (
                f" A tendência linear foi de **{trend_higher}** em {higher_name} "
                f"e de **{trend_lower}** em {lower_name}."
            )

            if lower_value == 0:
                return (
                    f"{period_text}, **{higher_name}** registrou **{fmt_number(higher_value)} {unit}** "
                    f"de {metric_name}; {comparison}." + trend_text
                )

            return (
                f"{period_text}, **{higher_name}** registrou **{fmt_number(higher_value)} {unit}** "
                f"de {metric_name}, {comparison} **{lower_name}** "
                f"(**{fmt_number(lower_value)} {unit}**)." + trend_text
            )

    parts = []

    for _, row in table.iterrows():
        municipio = row.get("municipio", "Município")
        uf = row.get("uf", "")

        if pd.isna(uf):
            uf = ""
        else:
            uf = str(uf).strip()

        nome = f"{municipio} ({uf})" if uf else str(municipio)

        final_value = row.get("final", np.nan)
        growth = row.get("crescimento_%", np.nan)

        if pd.isna(final_value):
            final_text = "valor não disponível"
        else:
            final_text = f"{fmt_number(final_value)} {metric_unit(result['metric'])}"

        if pd.isna(growth):
            growth_text = "variação não disponível"
        else:
            growth_text = f"variação de {fmt_pct(growth)}"

        parts.append(
            f"**{nome}**: {final_text}, {growth_text}."
        )

    return " ".join(parts)


def story_ranking(result):
    table = result.get("table", pd.DataFrame())

    if table is None or table.empty:
        return "Não encontrei dados suficientes para montar esse ranking."

    first = table.iloc[0]
    value_col = result.get("value_col", result.get("metric"))
    metric = result.get("metric")

    if value_col not in table.columns:
        value_col = metric

    if value_col not in table.columns:
        return "Encontrei os municípios, mas não consegui identificar o indicador do ranking."

    value = first[value_col]
    unit = metric_unit(metric)
    description = result.get("ranking_description", "critério solicitado")
    scope = (
        f" no estado de **{result['estado']}**"
        if result.get("estado")
        else ""
    )

    return (
        f"O município na primeira posição é **{first['municipio']} ({first['uf']})**, "
        f"com **{fmt_number(value)} {unit}**. "
        f"O ranking considera **{description}**{scope}."
    )


def story_growth_ranking(result):
    table = result.get("table", pd.DataFrame())

    if table is None or table.empty:
        return (
            "Não encontrei municípios com dados suficientes "
            "para calcular a variação no período."
        )

    if "crescimento_%" not in table.columns:
        return "Não foi possível calcular a variação percentual do ranking."

    first = table.iloc[0]
    direction = "queda" if result.get("ascending", False) else "crescimento"
    scope = f" no estado de **{result['estado']}**" if result.get("estado") else ""

    return (
        f"O maior resultado no critério de **{direction}** foi "
        f"**{first['municipio']} ({first['uf']})**, "
        f"com variação de **{fmt_pct(first['crescimento_%'])}** "
        f"entre {result['inicio']} e {result['fim']}" + scope + "."
    )


def story_ranking_history(result):
    table = result.get("table", pd.DataFrame())
    if table is None or table.empty:
        return "Não encontrei dados suficientes para construir o histórico dos maiores produtores."

    first_rank = (
        table.sort_values(["ranking", "ano"])
        .groupby("ranking", as_index=False)
        .first()
        .sort_values("ranking")
    )

    names = [
        f"**{r['municipio']} ({r['uf']})**"
        for _, r in first_rank.head(result.get("top_n", 5)).iterrows()
    ]
    scope = f" no estado de **{result['estado']}**" if result.get("estado") else ""

    return (
        f"Foram selecionados os **{len(names)} maiores produtores**{scope} no período de "
        f"{result['inicio']} a {result['fim']} e, em seguida, foi mostrada a evolução histórica deles. "
        f"Os municípios são: " + ", ".join(names) + "."
    )


def story_climate(result):
    a = result.get("analysis")
    if a is None:
        climate_label = result.get("climate_label", "clima")
        agricultural_label = result.get("agricultural_label", "produção")
        return (
            f"Não há dados suficientes para calcular a correlação entre "
            f"**{climate_label.lower()}** e **{agricultural_label.lower()}** "
            f"no período informado."
        )

    r = a["pearson"]

    if abs(r) < 0.2:
        strength = "muito fraca"
    elif abs(r) < 0.4:
        strength = "fraca"
    elif abs(r) < 0.6:
        strength = "moderada"
    elif abs(r) < 0.8:
        strength = "forte"
    else:
        strength = "muito forte"

    sign = "positiva" if r > 0 else "negativa" if r < 0 else "nula"

    climate_label = result.get("climate_label", "Clima")
    agricultural_label = result.get("agricultural_label", "Produção")

    return (
        f"Entre {result['inicio']} e {result['fim']}, a correlação de "
        f"Pearson entre **{climate_label.lower()}** e "
        f"**{agricultural_label.lower()}** em **{result['municipio']}** "
        f"foi **{r:.3f}**, indicando uma associação **{strength} e {sign}**. "
        f"A análise utilizou **{a['n']} observações válidas**. "
        f"O p-valor de Pearson foi **{a['pearson_p']:.4f}** e a análise "
        f"deve ser interpretada como associação estatística, não como prova de causalidade."
    )

def story_lag(result):
    a = result["analysis"]

    if a is None:
        return (
            "Não há dados suficientes para calcular a relação "
            "com a chuva defasada."
        )

    return (
        f"Considerando a precipitação defasada em "
        f"**{result['lag']} ano(s)**, a correlação com a "
        f"produtividade foi **{a['r']:.3f}**, usando "
        f"{a['n']} observações válidas. "
        f"Esse resultado indica associação temporal, "
        f"não causalidade."
    )


# ============================================================
# LLM OPCIONAL
# ============================================================

def llm_available():
    return bool(
        HAS_OPENAI
        and OPENAI_API_KEY
    )


def llm_story(question, structured_result):
    if not llm_available():
        return None

    try:
        client = OpenAI(
            api_key=OPENAI_API_KEY
        )

        system = """
Você é o analista do Sugar Cane Intelligence.

Receba uma pergunta e um resultado calculado por Python.

Explique o resultado em português brasileiro.

REGRAS:
- Não invente números.
- Não altere números.
- Não invente dados que não estejam no resultado.
- Não transforme previsão em observação.
- Diferencie correlação de causalidade.
- Seja objetivo.
- Se o resultado indicar falta de dados, diga isso.
- Máximo de 4 parágrafos curtos.
"""

        payload = {
            "pergunta": question,
            "resultado": structured_result,
        }

        response = client.responses.create(
            model=OPENAI_MODEL,
            instructions=system,
            input=json.dumps(
                payload,
                ensure_ascii=False,
                default=str,
            ),
        )

        text = response.output_text.strip()

        return text or None

    except Exception:
        return None


# ============================================================
# EXECUÇÃO
# ============================================================

def run_analysis(
    df,
    intent_data,
    question,
):
    intent = intent_data["intent"]
    municipalities = intent_data["municipios"]
    start = intent_data["inicio"]
    end = intent_data["fim"]
    metric = intent_data["metrica"]
    state_filter = intent_data.get("estado")

    # Rankings com estado citado devem considerar apenas os municípios da UF.
    ranking_df = df
    if state_filter:
        ranking_df = df[df["uf"].astype(str).str.upper() == state_filter["uf"]].copy()

    result = {
        "intent": intent,
        "inicio": start,
        "fim": end,
        "metric": metric,
        "municipios": municipalities,
        "estado": state_filter["estado"] if state_filter else None,
    }

    # HELP
    if intent == "help":
        result["story"] = help_text()
        return result

    # CATÁLOGO DE ANOS
    if intent == "available_years":
        years = sorted(pd.to_numeric(df["ano"], errors="coerce").dropna().astype(int).unique())
        result["table"] = pd.DataFrame({"Ano disponível": years})
        result["story"] = (
            f"A base possui dados para **{len(years)} anos**, de **{years[0]}** a **{years[-1]}**."
            if len(years) > 0
            else "Não encontrei anos disponíveis na base."
        )
        return result

    # CATÁLOGO DE MUNICÍPIOS
    if intent == "available_municipalities":
        columns = [c for c in ["municipio", "uf", "estado"] if c in df.columns]
        catalog = df[columns].dropna(subset=["municipio"]).drop_duplicates().copy()

        if state_filter and "uf" in catalog.columns:
            catalog = catalog[
                catalog["uf"].astype(str).str.upper() == state_filter["uf"]
            ].copy()

        catalog = catalog.sort_values(
            [c for c in ["estado", "uf", "municipio"] if c in catalog.columns]
        ).reset_index(drop=True)
        result["table"] = catalog
        scope = f" no estado de **{state_filter['estado']}**" if state_filter else ""
        result["story"] = f"Encontrei **{len(catalog)} municípios disponíveis**{scope}."
        return result

    # PICO ANUAL DE UMA SÉRIE
    if intent == "peak_year":
        if metric not in df.columns:
            result["error"] = "Não encontrei o indicador solicitado na base."
            return result

        if municipalities:
            target_municipality = municipalities[0]
            base = get_municipality_data(
                df,
                target_municipality,
                int(df["ano"].min()),
                int(df["ano"].max()),
            )
            scope_label = target_municipality
            aggregation_label = "série municipal"
        else:
            base = df.copy()
            scope_label = "Brasil"
            # Produção e área são agregadas por soma. Variáveis de clima e
            # produtividade usam a média municipal anual para representar o país.
            aggregation_label = (
                "total nacional"
                if metric in ["quantidade_produzida_t", "area_colhida_ha"]
                else "média municipal nacional"
            )

        if base.empty:
            result["error"] = "Não encontrei dados suficientes para calcular o pico anual."
            return result

        if aggregation_label == "série municipal":
            annual = base[["ano", metric]].dropna().copy()
        elif metric in ["quantidade_produzida_t", "area_colhida_ha"]:
            annual = base.groupby("ano", as_index=False)[metric].sum(min_count=1)
        else:
            annual = base.groupby("ano", as_index=False)[metric].mean()

        annual = annual.dropna(subset=[metric]).sort_values("ano")
        if annual.empty:
            result["error"] = "Não encontrei observações válidas para o indicador solicitado."
            return result

        peak = annual.loc[annual[metric].idxmax()]
        result.update(
            {
                "scope_label": scope_label,
                "aggregation_label": aggregation_label,
                "peak_year": int(peak["ano"]),
                "peak_value": float(peak[metric]),
                "latest_year": int(df["ano"].max()),
            }
        )
        return result

    # UNSUPPORTED
    if intent == "unsupported":
        result["error"] = unsupported_message(
            question,
            intent_data,
        )
        return result

    # --------------------------------------------------------
    # LÍDER / MAIOR OU MENOR INDICADOR
    # --------------------------------------------------------

    if intent == "leader":
        q = normalize_text(question)
        years = extract_years(
            question,
            int(df["ano"].min()),
            int(df["ano"].max()),
        )

        has_single_year = years[0] is not None and years[0] == years[1]

        ascending = any(
            x in q
            for x in ["menor", "menos", "pior"]
        )

        if has_single_year:
            year = years[0]
            table = ranking_by_year(
                ranking_df,
                metric,
                year,
                top_n=1,
                ascending=ascending,
            )
        else:
            period_start = years[0] if years[0] is not None else int(ranking_df["ano"].min())
            period_end = years[1] if years[1] is not None else int(ranking_df["ano"].max())
            mode = (
                "sum"
                if metric == "quantidade_produzida_t"
                else "max"
                if metric == "area_colhida_ha"
                else "mean"
            )
            aggregation_description = {
                "quantidade_produzida_t": "produção total acumulada",
                "area_colhida_ha": "área colhida máxima observada",
                "rendimento_medio_kg_ha": "produtividade média",
                "precipitacao_anual_mm": "precipitação média",
                "temperatura_media_anual_c": "temperatura média",
            }.get(metric, metric_label(metric).lower())
            table = ranking_period(
                ranking_df,
                metric,
                period_start,
                period_end,
                top_n=1,
                ascending=ascending,
                mode=mode,
            )

        if table.empty:
            result["error"] = (
                f"Não encontrei dados suficientes para identificar o município "
                f"com maior {metric_label(metric).lower()}."
            )
            return result

        result["table"] = table
        if has_single_year:
            result["year"] = year
        else:
            result["period_start"] = period_start
            result["period_end"] = period_end
            result["aggregation_description"] = aggregation_description
        result["value_col"] = metric
        result["municipio"] = str(table.iloc[0]["municipio"])
        result["uf"] = str(table.iloc[0]["uf"]) if "uf" in table.columns else ""
        result["codigo_ibge"] = table.iloc[0].get("codigo_ibge")
        result["value"] = table.iloc[0][metric]
        result["ascending"] = ascending
        result["story"] = story_leader(result)
        return result

    # --------------------------------------------------------
    # RANKING HISTÓRICO
    # --------------------------------------------------------

    if intent == "ranking_history":
        table = ranking_history(
            ranking_df,
            metric,
            start,
            end,
            top_n=intent_data["top_n"],
        )

        if table.empty:
            result["error"] = (
                f"Não encontrei dados suficientes entre {start} e {end} "
                "para montar o histórico dos maiores produtores."
            )
            return result

        result["table"] = table
        result["value_col"] = metric
        result["top_n"] = int(intent_data["top_n"])
        result["ranking_description"] = (
            f"média da produção entre {start} e {end}; o gráfico mostra a evolução anual"
        )
        result["story"] = story_ranking_history(result)
        return result

    # --------------------------------------------------------
    # RANKING
    # --------------------------------------------------------

    if intent == "ranking":
        q = normalize_text(question)

        # Inicializa antes de qualquer ramificação. Sem isso, perguntas
        # de ranking sem período explícito causavam:
        # UnboundLocalError: local variable 'mode'...
        mode = "mean"

        # PERGUNTA PONTUAL:
        # "qual município teve maior produção em 2010"
        # precisa usar SOMENTE 2010, e não média 1974-2024.
        explicit_year = extract_years(
            question,
            int(df["ano"].min()),
            int(df["ano"].max()),
        )

        if (
            explicit_year[0] is not None
            and explicit_year[0] == explicit_year[1]
        ):
            year = explicit_year[0]

            ascending = any(
                x in q
                for x in [
                    "menor",
                    "menos",
                    "pior",
                ]
            )

            # Crescimento/queda são outra modalidade.
            if any(
                x in q
                for x in [
                    "crescimento",
                    "aument",
                    "queda",
                    "caiu",
                    "reduziu",
                ]
            ):
                table = ranking_growth(
                    ranking_df,
                    metric,
                    start,
                    end,
                    top_n=intent_data["top_n"],
                    ascending=(
                        "queda" in q
                        or "reduziu" in q
                    ),
                )

                result["table"] = table
                result["ascending"] = (
                    "queda" in q
                    or "reduziu" in q
                )
                result["value_col"] = (
                    "crescimento_%"
                )
                result["ranking_description"] = (
                    f"variação entre {start} e {end}"
                )
                result["story"] = (
                    story_growth_ranking(result)
                )
                return result

            table = ranking_by_year(
                ranking_df,
                metric,
                year,
                top_n=intent_data["top_n"],
                ascending=ascending,
            )

            result["table"] = table
            result["year"] = year
            result["value_col"] = metric
            result["ranking_description"] = (
                f"valor observado no ano de {year}"
            )
            result["story"] = story_ranking(
                result
            )

            return result

        # Sem ano/período explícito, um ranking de "maior produção"
        # é interpretado como o ranking do último ano disponível.
        # Média/total só são usados quando o usuário pede explicitamente
        # período, média ou total. Isso evita respostas inesperadas.
        ascending = any(
            x in q
            for x in [
                "menor",
                "menos",
                "pior",
            ]
        )

        if any(
            x in q
            for x in [
                "crescimento",
                "aument",
                "queda",
                "caiu",
                "reduziu",
            ]
        ):
            table = ranking_growth(
                ranking_df,
                metric,
                start,
                end,
                top_n=intent_data["top_n"],
                ascending=(
                    "queda" in q
                    or "reduziu" in q
                ),
            )

            result["table"] = table
            result["ascending"] = (
                "queda" in q
                or "reduziu" in q
            )
            result["value_col"] = (
                "crescimento_%"
            )
            result["ranking_description"] = (
                f"variação entre {start} e {end}"
            )
            result["story"] = (
                story_growth_ranking(result)
            )
            return result

        has_explicit_period = (
            len(re.findall(r"\b(?:19|20)\d{2}\b", q)) >= 2
            or (
                explicit_year[0] is not None
                and explicit_year[1] is not None
                and explicit_year[0] != explicit_year[1]
            )
            or "ultimos" in q
            or "periodo" in q
            or "period" in q
            or "media" in q
            or "total" in q
            or ("entre" in q and "ano" in q)
        )

        if not has_explicit_period:
            # Sem ano informado, o ranking geral considera toda a série.
            start = int(ranking_df["ano"].min())
            end = int(ranking_df["ano"].max())
            mode = (
                "sum"
                if metric == "quantidade_produzida_t"
                else "max"
                if metric == "area_colhida_ha"
                else "mean"
            )
            table = ranking_period(
                ranking_df,
                metric,
                start,
                end,
                top_n=intent_data["top_n"],
                ascending=ascending,
                mode=mode,
            )
            result["value_col"] = metric
            result["ranking_description"] = (
                f"produção total acumulada de {start} a {end}"
                if metric == "quantidade_produzida_t"
                else f"área colhida máxima observada de {start} a {end}"
                if metric == "area_colhida_ha"
                else f"média de {start} a {end}"
            )
        else:
            mode = (
                "mean"
                if "media" in q
                else "sum"
                if metric == "quantidade_produzida_t"
                else "max"
                if metric == "area_colhida_ha"
                else "mean"
            )

            table = ranking_period(
                ranking_df,
                metric,
                start,
                end,
                top_n=intent_data["top_n"],
                ascending=ascending,
                mode=mode,
            )

            result["value_col"] = metric
            result["ranking_description"] = (
                f"produção total acumulada de {start} a {end}"
                if mode == "sum"
                else f"área colhida máxima observada de {start} a {end}"
                if mode == "max"
                else f"média de {start} a {end}"
            )

        result["table"] = table
        result["value_col"] = metric

        if "ranking_description" not in result:
            result["ranking_description"] = (
                f"média de {start} a {end}"
                if mode == "mean"
                else f"total de {start} a {end}"
            )

        result["story"] = story_ranking(
            result
        )

        return result

    # --------------------------------------------------------
    # COMPARAÇÃO
    # --------------------------------------------------------

    if intent == "comparison":
        if len(municipalities) < 2:
            result["error"] = (
                "Para comparar, informe pelo menos "
                "dois municípios. Exemplo: "
                "Compare Piracicaba e Ribeirão Preto."
            )
            return result

        rows = []

        for municipality in municipalities:
            d = get_municipality_data(
                df,
                municipality,
                start,
                end,
            )

            clean = d[
                ["ano", metric]
            ].dropna().sort_values("ano")

            if clean.empty:
                continue

            first = clean.iloc[0][metric]
            last = clean.iloc[-1][metric]
            average = clean[metric].mean()
            trend = calculate_trend(clean, metric)

            uf_value = ""
            if "uf" in d.columns and not d.empty:
                valid_uf = d["uf"].dropna().astype(str).str.strip()
                if not valid_uf.empty:
                    uf_value = valid_uf.iloc[0]

            codigo_value = None
            if "codigo_ibge" in d.columns and not d.empty:
                valid_code = d["codigo_ibge"].dropna()
                if not valid_code.empty:
                    codigo_value = valid_code.iloc[0]

            rows.append(
                {
                    "codigo_ibge": codigo_value,
                    "municipio": municipality,
                    "uf": uf_value,
                    "media": average,
                    "tendencia": trend["direction"] if trend else "indefinida",
                    "inicio": first,
                    "final": last,
                    "crescimento_%": growth_pct(
                        first,
                        last,
                    ),
                }
            )

        table = pd.DataFrame(rows)

        result["table"] = table

        chart_data = df[
            df["municipio"].isin(
                municipalities
            )
            & (df["ano"] >= start)
            & (df["ano"] <= end)
        ].copy()

        result["chart_data"] = chart_data
        result["story"] = story_comparison(
            result
        )

        return result

    # --------------------------------------------------------
    # POINT
    # --------------------------------------------------------

    if intent == "point":
        if not municipalities:
            result["error"] = (
                "Não consegui identificar o município. "
                "Informe o nome completo, por exemplo: "
                "Piracicaba."
            )
            return result

        municipality = municipalities[0]

        years = extract_years(
            question,
            int(df["ano"].min()),
            int(df["ano"].max()),
        )

        if years[0] == years[1]:
            year = years[0]
        else:
            year = end

        d = get_municipality_data(
            df,
            municipality,
            year,
            year,
        )

        result["municipio"] = municipality
        result["year"] = year
        result["data"] = d
        result["story"] = story_point(
            result
        )

        return result

    # --------------------------------------------------------
    # PROFILE / HISTORY
    # --------------------------------------------------------

    if intent in [
        "profile",
        "history",
    ]:
        if not municipalities:
            result["error"] = (
                "Não consegui identificar o município. "
                "Tente escrever o nome completo."
            )
            return result

        municipality = municipalities[0]

        d = get_municipality_data(
            df,
            municipality,
            start,
            end,
        )

        if d.empty:
            result["error"] = (
                f"Não encontrei dados de {municipality} "
                f"entre {start} e {end}."
            )
            return result

        result["municipio"] = municipality
        result["data"] = d
        result["trend"] = calculate_trend(
            d,
            metric,
        )
        result["cagr"] = calculate_cagr(
            d,
            metric,
        )
        result["story"] = story_history(
            result
        )

        return result

    # --------------------------------------------------------
    # CLIMATE
    if intent == "climate":
        if not municipalities:
            result["error"] = (
                "Para analisar a relação entre clima e agricultura, "
                "informe o município. Exemplo: "
                "Existe relação entre chuva e produção em Piracicaba?"
            )
            return result

        municipality = municipalities[0]

        d = get_municipality_data(
            df,
            municipality,
            start,
            end,
        )

        if d.empty:
            result["error"] = (
                f"Não encontrei dados de {municipality} "
                f"entre {start} e {end}."
            )
            return result

        q_norm = normalize_text(question)

        if "temperatura" in q_norm:
            climate_col = "temperatura_media_anual_c"
        else:
            climate_col = "precipitacao_anual_mm"

        if any(x in q_norm for x in [
            "produtividade", "rendimento", "kg/ha", "kg ha"
        ]):
            agricultural_col = "rendimento_medio_kg_ha"
        elif any(x in q_norm for x in [
            "area", "área", "hectare", "hectares"
        ]):
            agricultural_col = "area_colhida_ha"
        else:
            agricultural_col = "quantidade_produzida_t"

        climate_label = metric_label(climate_col)
        agricultural_label = metric_label(agricultural_col)

        analysis = correlation_analysis(
            d,
            climate_col,
            agricultural_col,
        )

        result["municipio"] = municipality
        result["data"] = d
        result["analysis"] = analysis
        result["climate_col"] = climate_col
        result["agricultural_col"] = agricultural_col
        result["climate_label"] = climate_label
        result["agricultural_label"] = agricultural_label

        valid = d[[climate_col, agricultural_col]].dropna()

        if not valid.empty:
            result["climate_mean"] = float(valid[climate_col].mean())
            result["agricultural_mean"] = float(valid[agricultural_col].mean())
        else:
            result["climate_mean"] = np.nan
            result["agricultural_mean"] = np.nan

        result["story"] = story_climate(result)

        return result

    # LAG
    # --------------------------------------------------------

    if intent == "lag":
        if not municipalities:
            result["error"] = (
                "Para analisar a chuva defasada, "
                "informe o município."
            )
            return result

        municipality = municipalities[0]

        d = get_municipality_data(
            df,
            municipality,
            start,
            end,
        )

        q = normalize_text(question)

        lag = 1

        m = re.search(
            r"(?:defasagem|lag)\s*(?:de)?\s*(\d+)",
            q,
        )

        if m:
            lag = max(
                1,
                min(
                    10,
                    int(m.group(1)),
                ),
            )

        analysis = lagged_correlation(
            d,
            "precipitacao_anual_mm",
            "rendimento_medio_kg_ha",
            lag=lag,
        )

        result["municipio"] = municipality
        result["lag"] = lag
        result["analysis"] = analysis
        result["story"] = story_lag(
            result
        )

        return result

    # --------------------------------------------------------
    # FORECAST
    # --------------------------------------------------------

    if intent == "forecast":
        if not municipalities:
            result["error"] = (
                "Para fazer uma projeção, informe o município."
            )
            return result

        municipality = municipalities[0]

        d = get_municipality_data(
            df,
            municipality,
            start,
            end,
        )

        q = normalize_text(question)

        years = [
            int(x)
            for x in re.findall(
                r"\b(?:19|20)\d{2}\b",
                q,
            )
        ]

        max_data_year = int(
            df["ano"].max()
        )

        future_years = [
            y
            for y in years
            if y > max_data_year
        ]

        target = (
            future_years[0]
            if future_years
            else max_data_year + 5
        )

        forecast = forecast_series(
            d,
            metric,
            target,
        )

        if forecast is None:
            result["error"] = (
                f"Não há dados suficientes para gerar "
                f"uma projeção confiável para {municipality}."
            )
            return result

        result["municipio"] = municipality
        result["forecast"] = forecast
        result["story"] = (
            f"Para **{municipality}**, o modelo selecionado foi "
            f"**{forecast['modelo']}**. A estimativa para "
            f"**{target}** é de **{fmt_number(forecast['previsao'])} "
            f"{metric_unit(metric)}**. "
            f"O último ano observado usado pelo modelo foi "
            f"{forecast['ultimo_ano']}."
        )

        return result

    # --------------------------------------------------------
    # DIAGNOSTIC
    # --------------------------------------------------------

    if intent == "diagnostic":
        if not municipalities:
            result["error"] = (
                "Informe o município para realizar o diagnóstico."
            )
            return result

        municipality = municipalities[0]

        d = get_municipality_data(
            df,
            municipality,
            start,
            end,
        )

        cols = [
            "ano",
            "quantidade_produzida_t",
            "area_colhida_ha",
            "rendimento_medio_kg_ha",
        ]

        clean = d[cols].dropna()

        if len(clean) < 2:
            result["error"] = (
                "Não há dados suficientes para decompor "
                "a evolução da produção."
            )
            return result

        first = clean.iloc[0]
        last = clean.iloc[-1]

        result["diagnostic"] = {
            "crescimento_producao": growth_pct(
                first["quantidade_produzida_t"],
                last["quantidade_produzida_t"],
            ),
            "crescimento_area": growth_pct(
                first["area_colhida_ha"],
                last["area_colhida_ha"],
            ),
            "crescimento_produtividade": growth_pct(
                first["rendimento_medio_kg_ha"],
                last["rendimento_medio_kg_ha"],
            ),
        }

        result["municipio"] = municipality
        result["story"] = (
            f"Entre {start} e {end}, a produção de "
            f"**{municipality}** variou "
            f"**{fmt_pct(result['diagnostic']['crescimento_producao'])}**. "
            f"A área colhida variou "
            f"**{fmt_pct(result['diagnostic']['crescimento_area'])}**, "
            f"enquanto a produtividade variou "
            f"**{fmt_pct(result['diagnostic']['crescimento_produtividade'])}**. "
            f"Esses três componentes ajudam a entender se a evolução "
            f"da produção esteve associada principalmente à expansão "
            f"da área, ao rendimento ou aos dois."
        )

        return result

    result["error"] = unsupported_message(
        question,
        intent_data,
    )

    return result


# ============================================================
# RENDERIZAÇÃO
# ============================================================

def render_result(
    result,
    question,
):
    if not isinstance(result, dict):
        st.error("Não foi possível interpretar o resultado desta pergunta.")
        return

    if "error" in result:
        st.error(
            result["error"]
        )
        return

    intent = result["intent"]

    # HELP
    if intent == "help":
        st.markdown(
            result["story"]
        )
        return

    # CATÁLOGO DE ANOS: mostra apenas o resumo, sem uma tabela extensa.
    if intent == "available_years":
        st.markdown(result.get("story", "Consulta concluída."))
        return

    # CATÁLOGO DE MUNICÍPIOS: o selectbox é pesquisável nativamente.
    # Ao digitar, o Streamlit sugere os municípios correspondentes.
    if intent == "available_municipalities":
        catalog = result.get("table", pd.DataFrame()).copy()
        st.markdown(result.get("story", "Consulta concluída."))

        if catalog.empty:
            st.info("Não há municípios para exibir com o filtro informado.")
            return

        label_columns = [c for c in ["municipio", "uf", "estado"] if c in catalog.columns]
        catalog["_label"] = catalog[label_columns].astype(str).agg(" — ".join, axis=1)
        options = catalog["_label"].tolist()

        selected_label = st.selectbox(
            "Pesquisar município",
            options=options,
            index=None,
            placeholder="Comece a digitar o nome do município...",
            key=f"municipality_catalog_search_{id(result)}",
        )

        if selected_label:
            selected = catalog.loc[catalog["_label"] == selected_label, label_columns]
            st.dataframe(selected, width='stretch', hide_index=True)
        return

    # PICO ANUAL: exibe somente os KPIs solicitados, sem gráfico ou tabela.
    if intent == "peak_year":
        metric = result["metric"]
        c1, c2, c3 = st.columns(3)

        with c1:
            st.metric(
                "Ano de maior valor",
                result["peak_year"],
            )

        with c2:
            st.metric(
                metric_label(metric),
                f"{fmt_number(result['peak_value'])} {metric_unit(metric)}",
            )

        with c3:
            st.metric(
                "Último ano da base",
                result["latest_year"],
            )

        st.caption(
            f"Escopo: {result['scope_label']} · Método: {result['aggregation_label']}."
        )
        return

    # STORY: começa diretamente pelo conteúdo da resposta.
    st.markdown(
        "### 📊 Resultado"
    )

    st.markdown(
        result.get(
            "story",
            "Análise concluída.",
        )
    )

    # --------------------------------------------------------
    # LEADER
    # --------------------------------------------------------

    if intent == "leader":
        metric = result.get("metric")
        value = result.get("value")

        c1, c2, c3, c4 = st.columns(4)

        with c1:
            st.metric(
                "Município",
                result.get("municipio", "N/D"),
            )

        with c2:
            st.metric(
                "UF",
                result.get("uf", "N/D"),
            )

        with c3:
            st.metric(
                metric_label(metric),
                (
                    f"{fmt_number(value)} "
                    f"{metric_unit(metric)}"
                )
                if not pd.isna(value)
                else "N/D",
            )

        with c4:
            st.metric(
                "Ano" if result.get("year") is not None else "Período",
                result.get("year")
                if result.get("year") is not None
                else f"{result.get('period_start')}–{result.get('period_end')}",
            )

        with st.expander(
            "📋 Ver dados utilizados"
        ):
            st.dataframe(
                result.get("table", pd.DataFrame()),
                width='stretch',
                hide_index=True,
            )

        return

    # --------------------------------------------------------
    # POINT
    # --------------------------------------------------------

    if intent == "point":
        d = result["data"]

        if not d.empty:
            row = d.iloc[0]
            metric = result["metric"]
            value = row[metric]

            c1, c2, c3 = st.columns(3)

            with c1:
                st.metric(
                    "Município",
                    result["municipio"],
                )

            with c2:
                st.metric(
                    "Ano",
                    result["year"],
                )

            with c3:
                st.metric(
                    metric_label(metric),
                    (
                        f"{fmt_number(value)} "
                        f"{metric_unit(metric)}"
                    )
                    if not pd.isna(value)
                    else "N/D",
                )

            with st.expander(
                "📋 Ver dados utilizados"
            ):
                st.dataframe(
                    d,
                    width='stretch',
                    hide_index=True,
                )

        return

    # --------------------------------------------------------
    # PROFILE / HISTORY
    # --------------------------------------------------------

    if intent in [
        "profile",
        "history",
    ]:
        d = result["data"]
        metric = result["metric"]

        clean = d[
            ["ano", metric]
        ].dropna().sort_values("ano")

        if not clean.empty:
            avg = clean[metric].mean()
            first = clean.iloc[0][metric]
            last = clean.iloc[-1][metric]
            growth = growth_pct(
                first,
                last,
            )

            c1, c2, c3 = st.columns(3)

            with c1:
                st.metric(
                    f"Média — {metric_label(metric)}",
                    (
                        f"{fmt_number(avg)} "
                        f"{metric_unit(metric)}"
                    ),
                )

            with c2:
                st.metric(
                    "Variação",
                    fmt_pct(growth),
                )

            with c3:
                trend = result.get("trend")

                st.metric(
                    "Tendência",
                    (
                        trend["direction"].title()
                        if trend
                        else "N/D"
                    ),
                )

        fig = plot_history(
            d,
            metric,
            result["municipio"],
        )

        render_chart(fig)

        with st.expander(
            "📋 Ver dados utilizados"
        ):
            st.dataframe(
                d,
                width='stretch',
                hide_index=True,
            )

        return

    # --------------------------------------------------------
    # COMPARISON
    # --------------------------------------------------------

    if intent == "comparison":
        table = result["table"]

        if not table.empty:
            display = table.copy()

            preferred = [
                "municipio",
                "uf",
                "media",
                "tendencia",
                "inicio",
                "final",
                "crescimento_%",
            ]
            available = [c for c in preferred if c in display.columns]
            display = display[available].copy()

            rename_map = {
                "municipio": "Município",
                "uf": "UF",
                "media": "Média histórica",
                "tendencia": "Tendência",
                "inicio": "Valor inicial",
                "final": "Valor final",
                "crescimento_%": "Variação (%)",
            }
            display = display.rename(columns=rename_map)

            st.dataframe(
                display,
                width='stretch',
                hide_index=True,
            )

        fig = plot_comparison(
            result["chart_data"],
            result["metric"],
        )

        render_chart(fig)

        return

    # --------------------------------------------------------
    # RANKING HISTÓRICO
    # --------------------------------------------------------

    if intent == "ranking_history":
        table = result["table"]

        if table.empty:
            st.warning("Não existem dados suficientes para exibir o histórico do ranking.")
            return

        summary = (
            table.groupby(["ranking", "codigo_ibge", "municipio", "uf"], as_index=False)[result["metric"]]
            .mean()
            .sort_values("ranking")
        )

        summary.columns = ["Ranking", "Código IBGE", "Município", "UF", f"Média — {metric_label(result['metric'])}"]
        st.dataframe(summary, width='stretch', hide_index=True)

        fig = plot_historical_ranking(table, result["metric"])
        render_chart(fig)

        return

    # --------------------------------------------------------
    # RANKING
    # --------------------------------------------------------

    if intent == "ranking":
        table = result["table"]
        metric = result["metric"]

        if table.empty:
            st.warning(
                "Não existem dados suficientes para exibir o ranking."
            )
            return

        display = table.copy()

        if result["value_col"] == "crescimento_%":
            display["crescimento_%"] = (
                display["crescimento_%"]
                .round(2)
            )

        st.dataframe(
            display,
            width='stretch',
            hide_index=True,
        )

        fig = plot_ranking(
            table,
            metric,
            result["value_col"],
        )

        render_chart(fig)

        return

    # --------------------------------------------------------
    # CLIMATE
    if intent == "climate":
        analysis = result.get("analysis")
        climate_col = result.get(
            "climate_col",
            "precipitacao_anual_mm",
        )
        agricultural_col = result.get(
            "agricultural_col",
            "quantidade_produzida_t",
        )

        climate_label = result.get(
            "climate_label",
            metric_label(climate_col),
        )
        agricultural_label = result.get(
            "agricultural_label",
            metric_label(agricultural_col),
        )

        if analysis is None:
            st.warning(
                "Não há observações suficientes para calcular a correlação. "
                "Verifique o período e a disponibilidade dos dados."
            )
            return

        c1, c2, c3, c4, c5 = st.columns(5)

        with c1:
            st.metric(
                climate_label,
                fmt_number(result.get("climate_mean", np.nan))
                + f" {metric_unit(climate_col)}",
            )

        with c2:
            st.metric(
                agricultural_label,
                fmt_number(result.get("agricultural_mean", np.nan))
                + f" {metric_unit(agricultural_col)}",
            )

        with c3:
            st.metric(
                "Pearson",
                f"{analysis['pearson']:.3f}",
            )

        with c4:
            st.metric(
                "Spearman",
                f"{analysis['spearman']:.3f}",
            )

        with c5:
            st.metric(
                "Observações",
                analysis["n"],
            )

        fig = plot_climate(
            result["data"],
            climate_col=climate_col,
            agricultural_col=agricultural_col,
            climate_label=climate_label,
            agricultural_label=agricultural_label,
        )

        render_chart(fig)

        st.caption(
            f"p-valor de Pearson: {analysis['pearson_p']:.4f}. "
            "Correlação mede associação, não causalidade."
        )

        return

    # LAG
    # --------------------------------------------------------

    if intent == "lag":
        analysis = result["analysis"]

        if analysis is not None:
            c1, c2, c3 = st.columns(3)

            with c1:
                st.metric(
                    "Defasagem",
                    f"{result['lag']} ano(s)",
                )

            with c2:
                st.metric(
                    "Correlação",
                    f"{analysis['r']:.3f}",
                )

            with c3:
                st.metric(
                    "Observações",
                    analysis["n"],
                )

        return

    # --------------------------------------------------------
    # FORECAST
    # --------------------------------------------------------

    if intent == "forecast":
        forecast = result["forecast"]

        c1, c2, c3 = st.columns(3)

        with c1:
            st.metric(
                "Modelo",
                forecast["modelo"],
            )

        with c2:
            st.metric(
                f"Estimativa {forecast['target_year']}",
                (
                    f"{fmt_number(forecast['previsao'])} "
                    f"{metric_unit(result['metric'])}"
                ),
            )

        with c3:
            st.metric(
                "Último observado",
                forecast["ultimo_ano"],
            )

        fig = plot_forecast(
            forecast
        )

        render_chart(fig)

        st.warning(
            "A projeção é uma estimativa baseada no histórico "
            "disponível. Não representa um valor observado."
        )

        return

    # --------------------------------------------------------
    # DIAGNOSTIC
    # --------------------------------------------------------

    if intent == "diagnostic":
        d = result["diagnostic"]

        c1, c2, c3 = st.columns(3)

        with c1:
            st.metric(
                "Variação da produção",
                fmt_pct(
                    d["crescimento_producao"]
                ),
            )

        with c2:
            st.metric(
                "Variação da área",
                fmt_pct(
                    d["crescimento_area"]
                ),
            )

        with c3:
            st.metric(
                "Variação da produtividade",
                fmt_pct(
                    d["crescimento_produtividade"]
                ),
            )

        return


# ============================================================
# CARREGAMENTO
# ============================================================

if not DATA_PATH.exists():
    st.error(
        "❌ Base de dados não encontrada."
    )

    st.code(
        str(DATA_PATH)
    )

    st.info(
        "Confirme se o arquivo está em:\n"
        "Sugar Cane\\Bases\\"
        + DATA_NAME
    )

    st.stop()

try:
    df = load_data(
        str(DATA_PATH)
    )
except Exception as exc:
    st.error(
        "❌ Erro ao carregar a base."
    )
    st.exception(exc)
    st.stop()

if df.empty:
    st.error(
        "A base foi carregada, mas está vazia."
    )
    st.stop()


MIN_YEAR = int(
    df["ano"].min()
)

MAX_YEAR = int(
    df["ano"].max()
)


# ============================================================
# CATÁLOGO DE MUNICÍPIOS (cacheado)
# Evita recalcular drop_duplicates + ordenação por tamanho de nome
# a cada pergunta enviada no chat.
# ============================================================

@st.cache_data(show_spinner=False)
def build_municipality_catalog(path_string):
    base = load_data(path_string)
    catalog = municipality_catalog(base)
    return catalog.sort_values(
        "_municipio_norm",
        key=lambda s: s.str.len(),
        ascending=False,
    ).reset_index(drop=True)


MUNICIPALITY_CATALOG = build_municipality_catalog(str(DATA_PATH))


# ============================================================
# ESTADO
# ============================================================

# Limpa respostas calculadas por versões anteriores quando a lógica é atualizada.
ANALYSIS_LOGIC_VERSION = "historico-lider-2026-08-30-5"
if st.session_state.get("analysis_logic_version") != ANALYSIS_LOGIC_VERSION:
    st.session_state.messages = []
    st.session_state.pending_question = None
    st.session_state.analysis_logic_version = ANALYSIS_LOGIC_VERSION

if "messages" not in st.session_state:
    st.session_state.messages = []

if "pending_question" not in st.session_state:
    st.session_state.pending_question = None


# ============================================================
# HEADER FIXO
# ============================================================

st.markdown(
    """
<div class="sc-fixed-header">
    <div class="sc-fixed-brand">
        <div>Sugar Cane Intelligence</div>
        <div class="sc-fixed-brand-sub">Desenvolvido por Gabriel Delvaje</div>
    </div>
</div>
""",
    unsafe_allow_html=True,
)

if st.button(
    "🌱",
    key="reset_chat_button",
    type="tertiary",
    help="Novo chat",
):
    st.session_state.messages = []
    st.session_state.pending_question = None
    st.rerun()



# ============================================================
# HOME
# ============================================================

if not st.session_state.messages:
    st.markdown(
        """
<div class="sc-hero">
    <div class="sc-hero-title">
        O que você quer saber sobre a cana?
    </div>
    <div class="sc-hero-subtitle">
        Pergunte em linguagem natural sobre produção, produtividade,
        clima e municípios.
    </div>
</div>
""",
        unsafe_allow_html=True,
    )

    suggestions = [
        "Qual município teve maior produção em 2024?",
        "Quais são os 10 maiores produtores de cana?",
        "Qual município teve maior produtividade em 2024?",
        "Compare Piracicaba e Ribeirão Preto entre 2010 e 2024.",
        "Como evoluiu a produção de Piracicaba?",
        "Existe relação entre chuva e produtividade em Piracicaba?",
    ]

    st.markdown(
        '<div class="sc-suggestion-title">'
        'Algumas perguntas para começar'
        '</div>',
        unsafe_allow_html=True,
    )

    for row_start in range(0, len(suggestions), 3):
        row = suggestions[row_start:row_start + 3]
        cols = st.columns(3)

        for col, suggestion in zip(cols, row):
            with col:
                if st.button(
                    suggestion,
                    width='stretch',
                    key=f"suggestion_{suggestion}",
                ):
                    st.session_state.pending_question = suggestion
                    st.rerun()


# ============================================================
# HISTÓRICO
# ============================================================

for message in st.session_state.messages:
    with st.chat_message(
        message["role"]
    ):
        if message["role"] == "user":
            st.markdown(
                f'<div class="sc-question">'
                f'{message["content"]}'
                f'</div>',
                unsafe_allow_html=True,
            )
        else:
            render_result(
                message["result"],
                message["question"],
            )


# ============================================================
# INPUT
# ============================================================

input_placeholder = "Pergunte sobre produção, produtividade, clima ou municípios..."

prompt = st.chat_input(input_placeholder)

if st.session_state.pending_question:
    prompt = st.session_state.pending_question
    st.session_state.pending_question = None


if prompt:
    prompt = prompt.strip()

    if prompt:
        st.session_state.messages.append(
            {
                "role": "user",
                "content": prompt,
            }
        )

        with st.chat_message(
            "user"
        ):
            st.markdown(
                f'<div class="sc-question">'
                f'{prompt}'
                f'</div>',
                unsafe_allow_html=True,
            )

        with st.chat_message(
            "assistant"
        ):
            with st.spinner(
                "Analisando a pergunta..."
            ):
                intent_data = build_intent(
                    df,
                    prompt,
                    MIN_YEAR,
                    MAX_YEAR,
                    catalog=MUNICIPALITY_CATALOG,
                )

                result = run_analysis(
                    df,
                    intent_data,
                    prompt,
                )

                if (
                    "error" not in result
                    and result.get("intent")
                    not in [
                        "help",
                    ]
                ):
                    llm_text = llm_story(
                        prompt,
                        result,
                    )

                    if llm_text:
                        result["story"] = llm_text

            render_result(
                result,
                prompt,
            )

        st.session_state.messages.append(
            {
                "role": "assistant",
                "result": result,
                "question": prompt,
            }
        )


# ============================================================
# FOOTER
# ============================================================

st.markdown(
    '<div class="sc-footer">'
    '<b>Sugar Cane Intelligence</b> '
    '&middot; Deselvolvido por Gabriel Delvaje'
    '</div>',
    unsafe_allow_html=True,
)
