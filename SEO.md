# Référencement de Mingle TV

Configuration du 14 septembre 2026. Le domaine canonique est **https://www.mingletv.app/** : l’adresse sans `www` redirige actuellement vers cette version. Conserver cette cohérence entre les domaines Vercel, les balises canonical, le sitemap et les liens partagés sur TikTok.

## Changements intégrés

- Titre et description ciblant « chat online », « random video chat » et Mingle TV / MingleTV.
- Présentation visible dans le footer, avec un titre H1, un guide de démarrage et des réponses utiles aux visiteurs. La zone vidéo conserve son affichage sur un écran.
- Mention naturelle d’une alternative à Omegle et OmeTV, sans prétendre à une affiliation avec ces marques.
- Données structurées `WebSite` au format microdata : nom Mingle TV, variante MingleTV et URL canonique. Aucune note, audience ou recommandation inventée.
- Métadonnées Open Graph pour le titre et la description des liens partagés.
- Descriptions et URL canoniques propres aux trois pages légales.
- `robots.txt` et `sitemap.xml` inclus dans les deux builds et servis par les deux serveurs. L’administration conserve un en-tête `noindex`, également appliqué au sous-domaine admin dans Vercel.

Les fautes « mgle », « omgle », « cht online », « mngltv » ne sont pas ajoutées en listes cachées, ni utilisées pour créer des pages quasi identiques. Elles ne correspondent pas à des variantes de marque établies. La répétition artificielle de mots ou variantes peut relever du bourrage de mots-clés selon [les règles antispam de Google](https://developers.google.com/search/docs/essentials/spam-policies). Le code ne peut garantir ni l’indexation ni la première page : [guide SEO de Google](https://developers.google.com/search/docs/fundamentals/seo-starter-guide).

## Après le déploiement

1. Vérifier la propriété `mingletv.app` dans Google Search Console via le DNS ou une autre méthode proposée par Google. Aucun accès à cette propriété n’a été configuré par ce travail.
2. Soumettre `https://www.mingletv.app/sitemap.xml`, puis inspecter l’URL d’accueil et demander son indexation si elle est accessible.
3. Vérifier que le domaine public n’exige pas de connexion Vercel et ne renvoie pas `noindex`. Les prévisualisations et l’admin doivent rester hors des résultats.
4. Sur TikTok, employer systématiquement le nom **Mingle TV** et pointer vers `https://www.mingletv.app/`. Ne pas se présenter comme le compte officiel d’Omegle ou d’OmeTV.
5. Suivre impressions, clics, requêtes et positions dans Search Console pour identifier les expressions réellement utilisées, y compris les éventuelles fautes. Les compteurs du panel ne distinguent pas les sources TikTok/Google : ce travail n’ajoute pas de suivi publicitaire.

Les données structurées de nom de site suivent [la documentation Google](https://developers.google.com/search/docs/appearance/site-names). Le choix du nom affiché et le classement restent automatisés par les moteurs.
