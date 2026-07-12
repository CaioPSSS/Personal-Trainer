# 📘 Documentação Técnica: Metabolic Tracker

Esta documentação serve como guia operativo e arquitetural para desenvolvedores humanos e agentes de IA que forem manter ou evoluir este projeto. Ela descreve o estado atual da aplicação, as regras de negócio, as decisões técnicas e os pontos de cuidado para evitar regressões.

---

## 🤖 Diretrizes críticas para agentes de IA

Antes de editar qualquer arquivo, respeite estas regras:

1. Não atualize o Prisma para a versão 6 ou 7. O projeto permanece fixado na versão 5.x para compatibilidade com o Vercel Postgres e o esquema atual.
2. Não altere o script de build. O build deve continuar sendo: `prisma db push && next build`.
3. Não mude o campo de data do modelo DailyLog de String para DateTime. O formato ISO `YYYY-MM-DD` é parte do contrato do sistema.
4. Preserve os campos opcionais em DailyLog. Eles existem para evitar quebra de compatibilidade com registros antigos.
5. Sempre considere o efeito sobre o algoritmo adaptativo antes de alterar a estrutura de dados ou a lógica de insights.

---

## 🧭 1. Visão geral do projeto

O Metabolic Tracker é uma aplicação full-stack para monitorar dados metabólicos de forma contínua e transformar isso em uma leitura clínica e preditiva, não apenas em um diário de anotações.

A aplicação atual possui quatro eixos centrais:

- Coleta de dados diários: peso, calorias, treino, sono, água, estresse, humor, proteína e circunferência da cintura.
- Cálculo adaptativo de meta calórica com base em tendência real de peso.
- Visualizações analíticas de tendência, déficit acumulado e recuperação.
- Análise semanal automática com IA, persistência de relatório e notificações em UI/WhatsApp.

### Stack atual

- Front-end e back-end: Next.js 16 com App Router.
- Linguagem: TypeScript.
- Banco: PostgreSQL via Vercel Postgres / Neon.
- ORM: Prisma Client 5.x.
- UI: Tailwind CSS, Recharts, lucide-react.
- IA: Google Gemini via `@google/generative-ai`.
- Notificações: CallMeBot para WhatsApp.

---

## 🗂️ 2. Mapa de arquivos e responsabilidades

### Front-end

- [app/page.tsx](app/page.tsx): Server Component que carrega dados iniciais via Prisma e passa props para o dashboard cliente.
- [app/components/DashboardClient.tsx](app/components/DashboardClient.tsx): componente principal do dashboard. Gerencia estado da UI, notificações, modal de relatório e envio do formulário diário.
- [app/components/OnboardingForm.tsx](app/components/OnboardingForm.tsx): onboarding inicial do usuário.
- [app/components/DailyEntryForm.tsx](app/components/DailyEntryForm.tsx): formulário de registro diário.
- [app/components/MetabolicCharts.tsx](app/components/MetabolicCharts.tsx): visualizações analíticas principais.
- [app/components/RecentHistoryTable.tsx](app/components/RecentHistoryTable.tsx): tabela com histórico recente.

### Estado e dados

- [app/hooks/useMetabolicData.ts](app/hooks/useMetabolicData.ts): hook central para sincronizar settings, logs, insights, loading e erro.
- [lib/dateUtils.ts](lib/dateUtils.ts): utilitários para manipulação de datas e compatibilidade com fusos.
- [lib/metabolicAlgo.ts](lib/metabolicAlgo.ts): motor metabólico com heurística inicial, recalculação adaptativa e geração de insights.
- [lib/prisma.ts](lib/prisma.ts): instância singleton do Prisma Client.

### API Routes

- [app/api/logs/route.ts](app/api/logs/route.ts): leitura e gravação de logs diários.
- [app/api/setup/route.ts](app/api/setup/route.ts): onboarding e persistência de UserSettings.
- [app/api/cron/ai-analysis/route.ts](app/api/cron/ai-analysis/route.ts): execução semanal da análise IA.
- [app/api/reports/unread/route.ts](app/api/reports/unread/route.ts): consulta do relatório não lido mais recente.
- [app/api/reports/[id]/read/route.ts](app/api/reports/[id]/read/route.ts): marca um relatório como lido.

### Banco

- [prisma/schema.prisma](prisma/schema.prisma): modelo de dados do projeto.
- [vercel.json](vercel.json): configuração de cron jobs do Vercel.

---

## 🗄️ 3. Modelo de dados

### 3.1 UserSettings

Modelo singleton usado para armazenar as preferências clínicas e a meta atual.

Campos:
- id: fixo como `singleton`
- age, height, gender, activityLevel: usados na heurística inicial.
- goal: `loss`, `maintenance` ou `gain`
- weeklyRate: progresso esperado por semana
- currentCalorieTarget: meta atual recalculada pelo motor
- createdAt / updatedAt: auditoria

### 3.2 DailyLog

Modelo de série temporal que representa um dia de registro.

Campos principais:
- date: String com formato `YYYY-MM-DD`
- weight: Float opcional
- caloriesConsumed: Int opcional
- caloriesBurned: Int opcional
- trainingType: String
- sleepHours: Float opcional
- waterIntake: Int opcional
- stressLevel: Int opcional
- mood: String opcional
- proteinConsumed: Int opcional
- waistCircumference: Float opcional
- createdAt: DateTime

Regras de integridade:
- Nunca trocar `date` para DateTime.
- Preservar todos os campos opcionais.
- Não remover campos sem planejar migração compatível.

### 3.3 AiReport

Modelo novo criado para persistir relatórios semanais de IA.

Campos:
- id: cuid()
- createdAt: DateTime
- content: String em Text
- isRead: Boolean default false

Uso:
- Armazenar o relatório gerado pelo Gemini.
- Expor o conteúdo no dashboard via modal.
- Permitir arquivamento ao marcar como lido.

---

## 🧠 4. Motor metabólico e lógica de negócio

A lógica central está em [lib/metabolicAlgo.ts](lib/metabolicAlgo.ts).

### 4.1 Fase inicial

Enquanto há poucos registros, a aplicação usa uma estimativa inicial baseada em Mifflin-St Jeor e no objetivo do usuário.

### 4.2 Fase adaptativa

Quando há 14 ou mais logs, o sistema tenta recalcular a meta com base em tendência real de peso e ingestão.

Regras importantes:
- O cálculo usa regressão linear de pesos válidos.
- O algoritmo tenta filtrar ruído hídrico e de glicogênio.
- O déficit acumulado é usado como sinal termodinâmico.
- `caloriesBurned` não entra no cálculo principal de TDEE adaptativo; é usado principalmente como contexto comportamental.
- Ajustes bruscos são amortecidos.

### 4.3 Geração de insights

O sistema cria insights semanais com base em:
- ingestão calórica média
- sono
- hidratação
- estresse
- humor
- proteína

Esses insights alimentam a seção de alertas e a análise semanal de IA.

---

## 🧩 5. Fluxos operacionais atuais

### 5.1 Fluxo de onboarding

1. O usuário preenche os dados iniciais no componente [app/components/OnboardingForm.tsx](app/components/OnboardingForm.tsx).
2. Os dados são enviados para [app/api/setup/route.ts](app/api/setup/route.ts).
3. O sistema cria ou atualiza o UserSettings singleton.
4. O dashboard passa a exibir os gráficos e o formulário diário.

### 5.2 Fluxo de registro diário

1. O usuário preenche o formulário em [app/components/DailyEntryForm.tsx](app/components/DailyEntryForm.tsx).
2. O evento é processado por [app/components/DashboardClient.tsx](app/components/DashboardClient.tsx).
3. O hook [app/hooks/useMetabolicData.ts](app/hooks/useMetabolicData.ts) aplica atualização otimista local.
4. O endpoint [app/api/logs/route.ts](app/api/logs/route.ts) salva ou atualiza o registro.
5. Se houver dados suficientes, o algoritmo adaptativo recalcula a meta.

### 5.3 Fluxo de dashboard analítico

O dashboard exibe:
- KPI cards com TDEE, variação de peso, gordura estimada oxidada e Recovery Score.
- Gráfico de tendência com EWMA e projeção futura.
- Gráfico de balanço energético acumulado.
- Radar de recuperação.

Esses gráficos usam Recharts e consomem os dados já carregados pelo hook.

### 5.4 Fluxo de análise semanal com IA

1. O cron job do Vercel dispara [app/api/cron/ai-analysis/route.ts](app/api/cron/ai-analysis/route.ts).
2. O endpoint valida um token `CRON_SECRET`.
3. Busca os últimos 14 registros de DailyLog.
4. Formata um payload enxuto e envia para o Gemini `gemini-1.5-flash`.
5. Cria um registro em AiReport.
6. Tenta enviar a mensagem por WhatsApp via CallMeBot.
7. O dashboard consulta os relatórios não lidos e exibe o modal de notificação.

---

## 🖥️ 6. Front-end: detalhes de implementação

### 6.1 DashboardClient

Este componente é o centro da experiência. Ele:
- carrega settings, logs e insights do hook;
- controla o formulário de setup e log;
- calcula os alerts visuais;
- gerencia o estado de relatório não lido;
- renderiza o sino de notificações e o modal.

### 6.2 Modal de relatório

O modal de relatório:
- é montado apenas quando `unreadReport !== null`;
- mostra o conteúdo bruto do relatório em formato de texto com whitespace preservado;
- usa Tailwind para aparência clínica e escura;
- desabilita o botão de fechamento enquanto a requisição de marcação como lido está em andamento.

### 6.3 Gráficos

Os gráficos são responsabilidade de [app/components/MetabolicCharts.tsx](app/components/MetabolicCharts.tsx).

Os componentes visuais atuais são:
- tendência preditiva de peso com EWMA e projeção futura
- balanço energético acumulado
- radar de recuperação

Não altere o propósito visual desses gráficos sem revisar o impacto no entendimento clínico da tela.

---

## 🔌 7. Backend e rotas da API

### 7.1 [app/api/logs/route.ts](app/api/logs/route.ts)

- GET: retorna logs e insights.
- POST: salva ou atualiza um log diário e recalcula a meta adaptativa quando há dados suficientes.

### 7.2 [app/api/setup/route.ts](app/api/setup/route.ts)

- Responsável por onboarding e atualização de UserSettings.

### 7.3 [app/api/cron/ai-analysis/route.ts](app/api/cron/ai-analysis/route.ts)

Este endpoint é sensível e deve ser tratado com cuidado.

Regras de execução:
- valida `CRON_SECRET`
- usa `maxDuration = 30` para o runtime serverless do Vercel
- consulta os últimos 14 dias de logs
- compacta o payload antes de enviar para o Gemini
- salva o relatório em AiReport
- tenta enviar WhatsApp sem bloquear o salvamento do relatório em caso de falha

### 7.4 [app/api/reports/unread/route.ts](app/api/reports/unread/route.ts)

- GET simples para recuperar o relatório não lido mais recente.

### 7.5 [app/api/reports/[id]/read/route.ts](app/api/reports/[id]/read/route.ts)

- POST para marcar relatório como lido.

---

## 🧪 8. Variáveis de ambiente

As variáveis abaixo devem existir no ambiente local e/ou Vercel:

- `POSTGRES_PRISMA_URL`: conexão principal do Prisma.
- `POSTGRES_URL_NON_POOLING`: conexão sem pool usada para validação local e `db push`.
- `CRON_SECRET`: token de segurança para o cron da IA.
- `GEMINI_API_KEY`: chave da API do Google Gemini.
- `WHATSAPP_NUMBER`: número de destino do CallMeBot.
- `CALLMEBOT_API_KEY`: chave do CallMeBot.

### Exemplo local

```env
POSTGRES_PRISMA_URL="postgres://..."
POSTGRES_URL_NON_POOLING="postgres://..."
CRON_SECRET="super-secret"
GEMINI_API_KEY="..."
WHATSAPP_NUMBER="5511999999999"
CALLMEBOT_API_KEY="..."
```

> Observação importante: sem `POSTGRES_URL_NON_POOLING`, o build local do Prisma falha com erro de validação.

---

## 🚀 9. Como rodar localmente

### Passo a passo

1. Instale as dependências:

```bash
npm install
```

2. Crie o arquivo `.env` com as variáveis acima.

3. Gere o cliente do Prisma e sincronize o schema:

```bash
npx prisma generate
npx prisma db push
```

4. Inicie o ambiente de desenvolvimento:

```bash
npm run dev
```

5. Valide o build como no Vercel:

```bash
npm run build
```

### Verificações rápidas

- `npx prisma generate` deve funcionar sem erro.
- `npx tsc --noEmit --pretty false` deve terminar sem erros.
- O dashboard deve carregar sem quebrar em caso de ausência de relatório não lido.

---

## 🧰 10. Boas práticas para manutenção

### 10.1 Ao editar o schema do Prisma

- Não alterar a versão do Prisma.
- Não mudar o tipo de `date`.
- Não remover campos opcionais de DailyLog sem migração explícita.
- Sempre regenerar o cliente depois de alterar o schema.

### 10.2 Ao editar os componentes

- Preserve a lógica atual do hook e o fluxo de dados.
- Se for adicionar um novo campo à UI, atualize o tipo em [app/hooks/useMetabolicData.ts](app/hooks/useMetabolicData.ts) e o backend.
- Não introduza renderização condicional agressiva que cause hydration mismatch.

### 10.3 Ao editar a camada de IA

- Mantenha o prompt clínico e a estrutura do payload o mais estáveis possível.
- Não troque o modelo sem revisar custo, latência e forma do output.
- Se o WhatsApp falhar, o sistema deve continuar persistindo o relatório em AiReport.

### 10.4 Ao editar rotas API

- Sempre use `try/catch`.
- Retorne status HTTP apropriados: 200, 401, 500.
- Não bloquear a criação do relatório por falhas de notificação externas.

---

## ⚠️ 11. Pontos de atenção e armadilhas conhecidas

- O build local pode falhar se `POSTGRES_URL_NON_POOLING` não estiver definido.
- O cron não deve depender de resposta de WhatsApp para concluir a criação do relatório.
- O modal de relatório deve ser tratado como um estado opcional, nunca como condição garantida.
- A implementação de gráficos deve respeitar a natureza clínica do produto e não transformar a tela em um simples painel de métricas superficiais.
- Alterações de schema exigem atualização do Prisma Client, do backend e da documentação.

---

## ✅ 12. Status atual verificado

A implementação atual foi validada com:

```bash
npx prisma generate
npx tsc --noEmit --pretty false
```

Ambos os comandos foram executados com sucesso.

---

## 🛠️ 13. Checklist para a próxima IA

Antes de trabalhar, confirme se você:
- leu esta documentação;
- entendeu a regra de manter `date` como String;
- entendeu a relação entre DailyLog, UserSettings e AiReport;
- sabe que o build depende de Prisma e das variáveis de ambiente corretas;
- preserva o fluxo de notificações sem introduzir duplicação de writes;
- evita regressões na lógica adaptativa do algoritmo metabólico.
