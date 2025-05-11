#!/bin/bash

# Script pour arrêter différentes versions du bot WhatsApp

# Vérifier si un argument a été fourni
if [ $# -eq 0 ]; then
    echo "Usage: ./stop-bot.sh [type]"
    echo "Types disponibles: type1, type2, all"
    exit 1
fi

# Définir le type de bot à arrêter
BOT_TYPE=$1

# Fonction pour arrêter un type de bot spécifique
stop_bot() {
    local type=$1
    echo "Arrêt du bot WhatsApp type $type..."
    
    # Arrêter le conteneur Docker
    docker-compose -f docker/docker-compose-$type.yml down
    
    echo "Bot WhatsApp type $type arrêté avec succès!"
}

# Arrêter le(s) bot(s) selon l'argument fourni
case $BOT_TYPE in
    "type1")
        stop_bot "type1"
        ;;
    "type2")
        stop_bot "type2"
        ;;
    "all")
        stop_bot "type1"
        stop_bot "type2"
        # Ajouter d'autres types ici si nécessaire
        ;;
    *)
        echo "Type de bot non reconnu: $BOT_TYPE"
        echo "Types disponibles: type1, type2, all"
        exit 1
        ;;
esac

echo "Terminé!"
