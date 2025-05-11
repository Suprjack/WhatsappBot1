#!/bin/bash

# Script pour démarrer différentes versions du bot WhatsApp

# Vérifier si un argument a été fourni
if [ $# -eq 0 ]; then
    echo "Usage: ./start-bot.sh [type]"
    echo "Types disponibles: type1, type2, all"
    exit 1
fi

# Définir le type de bot à démarrer
BOT_TYPE=$1

# Fonction pour démarrer un type de bot spécifique
start_bot() {
    local type=$1
    echo "Démarrage du bot WhatsApp type $type..."

    # Créer les dossiers nécessaires s'ils n'existent pas
    mkdir -p auth_baileys_$type database_$type

    # Créer le fichier contacts s'il n'existe pas
    if [ ! -f contacts_$type.json ]; then
        echo "{}" > contacts_$type.json
    fi

    # Démarrer le conteneur Docker
    docker-compose -f docker/docker-compose-$type.yml up -d

    echo "Bot WhatsApp type $type démarré avec succès!"
    echo "Pour voir les logs: docker logs -f whatsapp-bot-$type"
}

# Démarrer le(s) bot(s) selon l'argument fourni
case $BOT_TYPE in
    "basic")
        start_bot "type1"
        ;;
    "pro")
        start_bot "type2"
        ;;
    "premium")
        start_bot "type3"
        ;;
    "all")
        start_bot "type1"
        start_bot "type2"
        start_bot "type3"
        ;;
    *)
        echo "Type de bot non reconnu: $BOT_TYPE"
        echo "Types disponibles: basic, pro, premium, all"
        exit 1
        ;;
esac

echo "Terminé!"
