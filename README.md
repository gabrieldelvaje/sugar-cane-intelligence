# Sugar Cane Intelligence

Aplicação interativa para explorar a produção municipal de cana-de-açúcar no Brasil em conjunto com variáveis climáticas.

O projeto une dados da **Pesquisa Agrícola Municipal (PAM/IBGE)** com dados do **CRU TS**, permitindo investigar produção, área colhida, produtividade, temperatura e precipitação por município e por período.

## O que a aplicação faz

- Responde perguntas em linguagem natural sobre municípios, estados, anos e períodos;
- Cria rankings de produção, produtividade, área colhida, temperatura e precipitação;
- Compara dois municípios ao longo da série histórica;
- Calcula médias históricas, variações e tendências lineares;
- Exibe gráficos de série temporal e linhas de tendência;
- Analisa relações estatísticas entre clima e indicadores da cana;
- Informa a cobertura temporal e os municípios disponíveis na base.

## Base de dados

A base consolidada cobre o período de **1974 a 2024** e combina duas fontes:

| Fonte | Conteúdo utilizado |
| --- | --- |
| **PAM — Produção Agrícola Municipal (IBGE)** | Produção de cana, área colhida e produtividade municipal. |
| **CRU TS** | Séries climáticas de temperatura e precipitação, associadas aos municípios para análise conjunta com os dados agrícolas. |

O cruzamento gera uma base municipal anual utilizada pelo chatbot. Dessa forma, perguntas como “qual município teve maior produção?”, “como evoluiu a chuva em Piracicaba?” e “existe relação entre precipitação e produtividade?” podem ser respondidas a partir da mesma série integrada.

> Os resultados representam análises descritivas da base disponível. Relações de correlação indicam associação estatística e não comprovam causalidade.

## Estrutura do repositório

```
.
├── Bases/
│   └── PAM_cana_municipios_clima_CRU_1974_2024.csv.zip
├── Chatbot/
│   └── chatbot.py
├── requirements.txt
└── README.md
```

A base está compactada em `.zip`; o Pandas faz a leitura diretamente durante a execução.

## Como executar localmente

1. Clone o repositório:

```bash
git clone https://github.com/gabrieldelvaje/sugar-cane-intelligence.git
cd sugar-cane-intelligence
```

2. Crie e ative um ambiente virtual:

```bash
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
```

3. Instale as dependências:

```bash
pip install -r requirements.txt
```

4. Inicie o aplicativo:

```bash
streamlit run Chatbot/chatbot.py
```

## Implantação no Streamlit Community Cloud

O app pode ser publicado diretamente a partir deste repositório. No Streamlit Community Cloud, selecione:

- **Repositório:** `gabrieldelvaje/sugar-cane-intelligence`
- **Arquivo principal:** `Chatbot/chatbot.py`

Cada commit na branch `main` aciona uma atualização automática do aplicativo.

## Tecnologias

- Python
- Streamlit
- Pandas e NumPy
- Plotly
- SciPy e scikit-learn
- Statsmodels

## Autor

Desenvolvido por **Gabriel Delvaje**.
