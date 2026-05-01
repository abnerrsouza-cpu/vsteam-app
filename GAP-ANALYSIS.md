# Inventário de Funcionalidades — Gap Analysis

Análise do painel admin de referência vs o que a VS TEAM já tem rodando, e priorização do que faz sentido implementar a seguir. Foco em **funcionalidade**, não em design.

Legenda:
- ✅ Já tem na VS TEAM
- 🟡 Tem parcialmente
- ❌ Não tem (gap)

---

## 1. Dashboard / Visão Geral

| Feature | Status |
|---|---|
| KPIs de leads, vendas, receita | ✅ |
| KPIs de clientes ativos / em implementação | ✅ |
| KPI de "atualizaram hoje" (clientes que mandaram material) | ❌ |
| KPI de planos vencendo nos próximos 7 dias | ❌ |
| KPI de aniversariantes do dia | ❌ |
| KPI de clientes "sem vigência" definida | ❌ |
| Calendário mensal com eventos por categoria (atualizações, vencimentos, treinos, aniversários) | ❌ |
| Toggle de tema (dark/light) | ❌ |

## 2. Vigência / Plano / Vencimentos

| Feature | Status |
|---|---|
| Cliente tem plano ativo / pausado / encerrado | ✅ |
| Cliente tem **data de vencimento** do plano | ❌ |
| Lista de "vencimentos próximos" com badges (vence hoje / em N dias) | ❌ |
| Lista de clientes "sem atualização recente" | 🟡 (tem na Gestão Contínua de outra forma) |
| Lista de clientes "sem protocolo" (sem treino e sem dieta atrelados) | ❌ |
| Renovação de plano com 1 clique (estende vigência) | ❌ |

## 3. Convite / Onboarding

| Feature | Status |
|---|---|
| Cadastro manual do cliente pelo admin | ✅ |
| **Link de convite** que o admin manda e o cliente preenche dados sozinho | ❌ |
| Configuração do convite: pede anamnese? pede fotos iniciais? | ❌ |
| Quais planos vão no convite (Treino / Dieta) | ❌ |
| **Templates de convite** salvos (reutilizáveis) | ❌ |

## 4. Múltiplos planos por cliente

| Feature | Status |
|---|---|
| Cliente tem 1 plano único | ✅ |
| Cliente pode ter **Treino e Dieta como produtos separados** com vigências independentes | ❌ |
| Toggle por plano no perfil (ativar/desativar Treino sem mexer em Dieta) | ❌ |

## 5. Detalhe do Aluno

| Feature | Status |
|---|---|
| Tabs Info / Questionário / Treinos / Dieta / Fotos / Avaliações / Feedback | ✅ |
| **Atualizações programadas** (agendar mudança futura no treino/dieta) | ❌ |
| Histórico de atualizações por aluno | 🟡 (tem só feedbacks por semana) |
| **Botão exportar PDF** do treino atual com a marca | ❌ |
| **Botão exportar PDF** da dieta atual | ❌ |
| Observações pessoais com **rich text editor** (negrito, listas, etc) | 🟡 (tem textarea simples) |
| Última data de atualização pelo profissional (timestamp visível) | 🟡 (tem semana atual mas não data) |

## 6. Calculadoras nutricionais

| Feature | Status |
|---|---|
| Cálculo de Taxa Metabólica Basal (TMB) automático | ❌ |
| Cálculo de Gasto Calórico Estimado | ❌ |
| Meta de proteína calculada por peso/objetivo | ❌ |
| Análise de macros da dieta montada (kcal, P, C, G, Fibras) | 🟡 (tem campo manual) |
| Distribuição de macronutrientes em gráfico (donut) | ❌ |
| **Banco de alimentos com nutrientes** (TACO/USDA) | ❌ |

## 7. Ficha de dieta como entidade primária

| Feature | Status |
|---|---|
| Lista global de "todas as fichas de dieta" | ❌ (tem só dentro do cliente) |
| Refeições estruturadas (Café / Almoço / Lanche / Jantar / Ceia) com itens | 🟡 (texto livre hoje) |
| Cada item com gramatura + cálculo automático de kcal/macros | ❌ |
| Plano de dieta por **dias da semana** (segunda diferente de domingo) | ❌ |
| Meta de água diária | ❌ |
| Adesão à dieta (cliente marca o que comeu) | ❌ |
| Toggle "exibir macros no app do cliente" | ❌ |

## 8. Ficha de treino como entidade primária

| Feature | Status |
|---|---|
| Lista global de "todas as fichas de treino" | ❌ |
| Treino com tipos de série: **Válidas / Aquecimento / Preparatórias** | ❌ (só tem séries padrão) |
| **Superset** entre exercícios | ❌ |
| **Periodização semanal** (criar template e aplicar em N semanas) | ❌ |
| Edição em massa de exercícios | ❌ |
| Cardio separado da musculação dentro da mesma ficha | ❌ |
| Cardio com unidade Minutos / Horas, frequência Semanal / Diário | ❌ |
| Banco de exercícios | ✅ |
| **Importar exercício** do banco para uma ficha (em vez de cadastrar manual) | 🟡 (tem mas pouco integrado) |

## 9. Execução do treino pelo cliente

| Feature | Status |
|---|---|
| Iniciar sessão de treino | ✅ |
| Cronômetro total + descanso | ✅ |
| Registro de peso e reps por série | ✅ |
| Tela de "Parabéns" no final | ✅ |
| Vídeo de execução em modal | ✅ |
| **Esforço percebido** (RPE 1-10) ao finalizar treino | ❌ |
| **Observação do treino** ao finalizar (como se sentiu) | ❌ |
| **Progressão de carga** em gráfico (peso × tempo por exercício) | ❌ |

## 10. Comunicação com o cliente

| Feature | Status |
|---|---|
| Lembretes copy-paste pra Whatsapp | ✅ |
| **Chat interno** admin ↔ cliente dentro do app | ❌ |
| Disparo automatizado via **WhatsApp API** (com tracking entregue/lido) | ❌ |
| Notificações agendadas | 🟡 (tem só lembrete simples) |
| Histórico de comunicações enviadas | 🟡 |

## 11. Avaliações físicas detalhadas

| Feature | Status |
|---|---|
| Peso e medidas básicas (peito, cintura, quadril, braço, perna) | ✅ |
| **Dobras cutâneas** (bíceps, tríceps, subescapular, etc.) | ❌ |
| **Bioimpedância** (% gordura, massa magra, água) | ❌ |
| Cálculo automático de IMC, % gordura, massa magra | ❌ |

## 12. Aulas / Conteúdo

| Feature | Status |
|---|---|
| Biblioteca de exercícios com vídeo | ✅ |
| **Videoaulas** (palestras, mini-cursos para o aluno) | ❌ |

## 13. Segurança

| Feature | Status |
|---|---|
| Bloquear screenshot na tela de treino (watermark) | ✅ |
| Bloquear screenshot na tela de dieta | ❌ |
| **Bloquear login em múltiplos dispositivos** simultâneos | ❌ |

## 14. Tabelas / Filtros

| Feature | Status |
|---|---|
| Listas básicas | ✅ |
| **Filtros avançados** (status, plano, data, sem treino, etc.) | ❌ |
| Busca por coluna | ❌ |
| Ordenação por qualquer coluna | 🟡 |

## 15. Cadastros auxiliares

| Feature | Status |
|---|---|
| Categorias / tags / grupos musculares customizáveis | ❌ |
| Modelos de treino reutilizáveis | ❌ |
| Modelos de dieta reutilizáveis | ❌ |

---

# Prioridades sugeridas

Ordenado pelo que mais movimenta o ponteiro do negócio (fricção do dia a dia ou churn que evita):

### 🔴 Alta — implementar primeiro

1. **Vigência do plano + dashboard de vencimentos** — o painel do Victor precisa avisar "fulano vence em 3 dias" pra renovar. É o que segura receita.
2. **Link de convite** — em vez de cadastrar 1 a 1, manda um link e o aluno preenche tudo. Reduz fricção do onboarding e a anamnese vem completa do cliente.
3. **Templates de treino e dieta reutilizáveis** — Victor monta uma vez "Push A iniciante" e aplica em N alunos com 1 clique.
4. **PDF do treino e da dieta com a marca VS TEAM** — cliente pede pra imprimir, e gera marketing toda vez que ele compartilha.
5. **Calculadoras nutricionais** (TMB, GET, meta de proteína) — pra montar dieta o Victor não precisa abrir calculadora à parte.
6. **Banco de alimentos com macros** — refeição com gramatura e kcal/macros calculados automaticamente.

### 🟡 Média — segundo ciclo

7. **Atualizações programadas** (agendar troca de treino no futuro).
8. **Múltiplos planos por cliente** (Treino + Dieta como produtos separados, vigência independente).
9. **Calendário de eventos** no dashboard.
10. **Esforço percebido + observação** ao finalizar treino.
11. **Progressão de carga** em gráfico por exercício.
12. **Filtros avançados** nas listas.

### 🟢 Baixa — pode esperar

13. Chat interno admin↔cliente (Whatsapp resolve por enquanto).
14. Disparo automático WhatsApp (precisa API paga).
15. Adesão à dieta (cliente marca o que comeu).
16. Avaliações com dobras cutâneas / bioimpedância.
17. Videoaulas.
18. Toggle dark/light (já tá dark, ok).

---

# Próximo passo

Sugiro começar pelos **3 da Alta** que mais te incomodam hoje.
Me diz qual destes 6 da Alta você prioriza e eu implemento na sequência (cada um numa rodada):

- [ ] Vigência + dashboard de vencimentos
- [ ] Link de convite com onboarding self-service
- [ ] Templates reutilizáveis (treino e dieta)
- [ ] PDF do treino e da dieta
- [ ] Calculadoras nutricionais (TMB, GET, macros)
- [ ] Banco de alimentos com macros automáticos

Você marca os 3 mais importantes e eu começo pelo #1.
