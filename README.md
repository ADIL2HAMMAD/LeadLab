# LeadLab

Atelier de préparation à un entretien **Tech Lead / développeur Fullstack Java, Spring Boot et React / TypeScript**, en français et entièrement utilisable hors ligne.

## Démarrage

Téléchargez le dépôt avec **Code → Download ZIP**, extrayez tout le dossier puis ouvrez **index.html** dans Edge, Chrome ou Firefox. Aucune installation, compilation ou dépendance serveur n’est nécessaire.

Gardez `index.html`, `styles.css`, `data.js`, `app.js` et les dossiers `assets` et `content` ensemble.

## Ce qui est inclus

- 8 modules : Java Core, Spring Boot, JPA/Hibernate, Spring Security, React/TypeScript, architecture, Tests/DevOps et leadership.
- 200 fiches détaillées (25 par module) avec mécanismes, exemples de code, pièges et relances d’entretien.
- 200 questions de quiz (25 par module) : ordre et choix mélangés, correction expliquée, score et rejeu des erreurs.
- Recherche, filtres, favoris et notes personnelles.
- Planning de 14 jours : objectifs, exercices, livrables et dates ajustables.
- Entretien blanc de 4, 6 ou 8 questions, avec chronomètre, notes, attendus et bilan d’auto-évaluation.
- 4 mises en situation : réservation de stock, incident API, livraison sous pression et recherche multi-tenant.
- Historique et progression enregistrés localement, export/import JSON.
- Design responsive, navigation clavier, styles d’impression et respect des préférences de mouvement réduit.

## Sauvegarde de la progression

Les données restent dans le navigateur. Le stockage dépend du navigateur et de l’adresse : ouverture locale, aperçu HTTP ou dossier déplacé peuvent utiliser des espaces distincts. Le comportement de `localStorage` sur un fichier local peut varier ; un bandeau signale son indisponibilité.

Dans **Mes données**, exportez régulièrement un JSON. Il permet de conserver vos notes et votre progression, puis de les importer dans un autre navigateur. L’import remplace les données présentes après confirmation. Les 100 derniers quiz et 50 derniers entretiens sont conservés.

## Méthode de travail

Répondez à voix haute avant de révéler une fiche. Comparez le mécanisme, l’exemple et les compromis ; ajoutez une expérience réelle dans vos notes. Faites un quiz, reprenez les erreurs, puis réalisez l’exercice du jour. En entretien blanc, évaluez précision, raisonnement, clarté et recul après avoir formulé votre réponse.

Le planning de 14 jours cible les fondamentaux ; utilisez les fiches complémentaires pour approfondir à votre rythme. Les identifiants des anciennes fiches et des anciens quiz sont conservés pour préserver votre progression.

Le score d’entretien est une **auto-évaluation**, sans analyse automatique ni microphone. Les exercices se réalisent dans votre environnement ou sur papier ; le site ne compile pas le code.

## Structure

```text
index.html       Structure de la page et chargement local
styles.css       Design responsive et impression
data.js          Fiches, quiz, planning, cas pratiques et références
content/         Banque complémentaire : 19 fiches et 21 quiz par module
app.js           Navigation, interactions et stockage
assets/          Icône locale
LISEZ-MOI.txt    Mode d’emploi hors ligne
```

L’application utilise du JavaScript classique, sans modules ES, chargement distant de données, CDN ou police externe. Seuls les liens de documentation, ouverts volontairement depuis **Références & méthode**, nécessitent Internet.

Le contenu vise Java 17+ ; les exemples de threads virtuels nécessitent Java 21+. Les extraits pédagogiques peuvent omettre imports et types. Vérifiez les API selon les versions exactes de votre projet.

## Aperçu de développement facultatif

L’ouverture directe de `index.html` suffit. Pour un aperçu HTTP local avec Python installé :

```sh
python -m http.server 8765 --bind 127.0.0.1
```

Ouvrez ensuite `http://127.0.0.1:8765/`. Ce serveur est uniquement une commodité de développement ; il n’est pas requis pour utiliser le site hors ligne.

Édition : 13 octobre 2026.
