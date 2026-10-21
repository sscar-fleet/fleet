#!/usr/bin/env bash
# Relais SS CAR FLEET -> WhatsGPS (Seeworld) depuis l'IP fixe du serveur OVH.
# Seules les requêtes portant la bonne clé X-Relais-Cle passent ; tout le reste est refusé.
set -e
DOMAINE="relais.sscarsystem.com"
CLE="$(openssl rand -hex 24)"
sudo apt-get update -y
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl ufw
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg --yes
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo apt-get update -y && sudo apt-get install -y caddy
sudo tee /etc/caddy/Caddyfile >/dev/null <<CADDY
$DOMAINE {
	@autorise header X-Relais-Cle $CLE
	handle @autorise {
		request_header -X-Relais-Cle
		reverse_proxy https://www.whatsgps.com {
			header_up Host www.whatsgps.com
			header_up -X-Forwarded-For
			header_up -X-Forwarded-Host
			header_up -X-Forwarded-Proto
		}
	}
	handle {
		respond "Interdit" 403
	}
}
CADDY
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw --force enable
sudo systemctl restart caddy
echo ""
echo "=============================================="
echo " Relais installé sur https://$DOMAINE"
echo " Clé à coller dans Vercel (WHATSGPS_RELAIS_CLE) :"
echo " $CLE"
echo "=============================================="
