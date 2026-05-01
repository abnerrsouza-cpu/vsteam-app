#\!/bin/bash
# VS TEAM APP - Setup automático
set -e
cd "$(dirname "$0")"

echo ""
echo "🔥 VS TEAM APP — SETUP"
echo "========================"
echo ""

# Verifica node
if \! command -v node &> /dev/null; then
  echo "❌ Node.js não encontrado. Instale em: https://nodejs.org"
  exit 1
fi

echo "✅ Node.js $(node -v) detectado"
echo ""
echo "📦 Instalando dependências (npm install)..."
npm install

echo ""
echo "🌱 Populando banco de dados..."
node database.js --seed

echo ""
echo "✅ SETUP CONCLUÍDO\!"
echo ""
echo "Para subir o servidor:"
echo "  npm start"
echo ""
echo "Acesse: http://localhost:3000"
echo ""
echo "🔑 Credenciais de teste:"
echo "  Admin (Victor): victor@vsteam.com  / vsteam2026"
echo "  Cliente:        joao@cliente.com    / cliente123"
echo ""
