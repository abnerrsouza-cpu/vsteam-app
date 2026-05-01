# VS TEAM APP

Sistema completo de gestão para consultoria online de Personal Trainer da VS TEAM (Victor).

## Duas frentes

**ADMIN (Victor):**
- Dashboard com métricas do negócio
- CRM de captação (Academia / Story Instagram / Indicação)
- Pipeline de Vendas (Interesse → Objeção → Negociação → Contrato)
- Implementação (Questionário + Fotos + Montagem do treino)
- Gestão Contínua semanal (Lembrete quarta + Fotos sábado + Feedback + Novo treino)
- Central de clientes (cards clicáveis)
- Biblioteca de exercícios com vídeos
- Painel Gym Cats (configurar pontuação e ranking)
- Central de lembretes semanais

**CLIENTE:**
- Dashboard com progresso pessoal
- Treinos da semana com vídeos dos exercícios
- Check-in de exercícios concluídos
- Upload de fotos semanais
- Galeria "Antes x Depois"
- Ranking Gym Cats (gamificação entre clientes)
- Ficha de avaliação semanal
- Perfil

## Como rodar

```bash
# 1. Instalar dependências
npm install

# 2. Criar banco + dados de exemplo
node database.js --seed

# 3. Subir servidor
npm start
```

Acesse: http://localhost:3000

## Credenciais de teste

**Admin (Victor):**
- Email: `victor@vsteam.com`
- Senha: `vsteam2026`

**Cliente de exemplo:**
- Email: `joao@cliente.com`
- Senha: `cliente123`

## Estrutura

```
vs-team-app/
├── server.js                 # Servidor Express principal
├── database.js               # Schema SQLite + seed
├── routes/
│   ├── auth.js               # Login / logout
│   ├── admin.js              # Todas as rotas do ADM
│   └── client.js             # Todas as rotas do Cliente
├── middleware/auth.js        # Auth guards por role
├── views/                    # Templates EJS
│   ├── layouts/              # Layouts base (admin/client/auth)
│   ├── admin/                # Páginas admin
│   ├── client/               # Páginas cliente
│   └── auth/                 # Tela de login
├── public/
│   ├── css/                  # Estilos
│   ├── js/                   # Scripts cliente
│   ├── logos/                # ← COLOQUE O LOGO VS TEAM AQUI (logo.png)
│   └── uploads/              # Fotos enviadas pelos clientes
└── data/vsteam.db            # Banco SQLite (gerado)
```

## Jornada implementada

1. **Captação** — lead cadastrado com origem (academia / story / indicação)
2. **Conversa** — marca como "em conversa"
3. **Vendas** — avança pipeline (quebra de objeção)
4. **Negociação** — define plano e prazo
5. **Contrato** — converte lead em cliente
6. **Questionário** — cliente preenche
7. **Fotos iniciais** — cliente envia
8. **Treino montado** — admin cria
9. **Ciclo semanal** — lembrete quarta / fotos sábado / feedback / novo treino

## Tema visual

Dark mode preto + vermelho VS TEAM (variáveis em `public/css/style.css`).
Coloque seu logo em `public/logos/logo.png` e aparecerá automaticamente no topo.
