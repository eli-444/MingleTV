# Administration Mingle TV

## Tableau de bord visuel

Le fond noir et les couleurs différenciées distinguent les visites, sessions et signalements. Les nombres utilisent des chiffres de largeur fixe. Les graphiques sont en SVG, sans bibliothèque ni police chargée depuis un service tiers.

Le graphique temps réel représente exactement **30 minutes consécutives**, y compris celles à zéro visite. Il est ancré sur l’heure renvoyée par l’API plutôt que sur la dernière minute ayant reçu une visite. L’heure affichée est **Europe/Paris** par défaut (avec changement été/hiver automatique) ; le sélecteur permet UTC et mémorise ce choix dans le navigateur. La minute en cours est partielle. Les données restent datées de leur dernière récupération lorsqu’une actualisation échoue.

Le choix Curve/Bars, le survol et le focus clavier donnent accès aux valeurs. Le graphique journalier permet de choisir pages vues, connexions ou associations. Les totaux journaliers et mensuels restent en **UTC** ; changer le fuseau d’affichage de la courbe ne recalcule pas ces agrégats. Le camembert indique la part des visites dans les pays affichés sur 30 jours, hors localisation inconnue ; il ne représente pas les utilisateurs actuellement en ligne.

Le serveur historique SQLite n’expose pas les visites par minute : le panel affiche une indisponibilité explicite pour cette courbe, sans inventer une activité nulle. Aucun changement de migration Supabase n’est nécessaire pour cette présentation.

## Accès

- En production : **https://adminsecret.mingletv.app**, après configuration de ce domaine dans Vercel et dans le DNS.
- En local : **http://localhost:3000/admin**, avec `npm start` et les variables Supabase.
- Mot de passe : **ADMIN-ACCESS.local.txt**. Ce fichier et `.env` sont exclus de Git.

`npm run setup:admin` génère les identifiants manquants et `SERVER_SECRET`, sans remplacer un mot de passe déjà configuré. Pour le renouveler : `npm run setup:admin -- --rotate`, puis copier le nouveau `ADMIN_PASSWORD_HASH` dans Vercel et redéployer.

Le panel n'est pas lié depuis le site public. Les API vérifient le sous-domaine, le mot de passe et la session. Le cookie est réservé à l'hôte admin, HttpOnly, SameSite=Strict et Secure en production ; les modifications exigent aussi un jeton CSRF.

Les sessions durent huit heures et sont partagées dans Supabase. La déconnexion révoque la session courante. Un changement de mot de passe seul ne révoque pas les autres sessions. Changer `SERVER_SECRET` les invalide, mais change aussi les empreintes des statistiques : conserver ce secret stable en fonctionnement normal.

## Fonctions

Examiner les signalements, modifier leur statut et les notes internes, bloquer l'IP pendant 1/7/30 jours, débloquer une IP et supprimer un dossier. L'IP provient de la connexion de la personne signalée, pas d'une valeur déclarée par le navigateur. Les réseaux partagés et VPN limitent sa valeur d'identification.

Le panel affiche les pages vues, connexions, duos, pics et signalements par jour et par mois. Les visiteurs distincts ne couvrent que les navigateurs consentants. Les compteurs peuvent inclure les essais techniques et ne mesurent pas la bande passante vidéo.

Les informations d'exploitant, de contact, d'adresse, d'hébergement et de rétention alimentent la confidentialité publique. Réduire la rétention purge les dossiers trop anciens. Aucun historique du chat ni enregistrement vidéo n'est joint aux signalements.

## Publication et entretien

Suivre [VERCEL.md](VERCEL.md) pour les variables, le DNS et les tâches Cron. Vérifier les exécutions des purges dans Supabase et surveiller les quotas.

L'ancienne architecture sans Supabase conserve un chemin local aléatoire `ADMIN_PATH` et SQLite. Elle ne doit pas être confondue avec le panel Vercel décrit ici.
