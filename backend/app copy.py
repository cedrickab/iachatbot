import markdown

# Markdown text
markdown_text = """
Voici quelques excellentes options pour déguster une cuisine asiatique :

1. **Panasia**
   - **Description** : Restaurant asiatique à Saint-Laurent-du-Var, avec une vue sur la mer, offrant une cuisine variée et des plats de qualité grâce à des ingrédients soigneusement sélectionnés.
   - **Horaires** : Lundi - Samedi : 11h40 à 23h, Dimanche : 11h40 à 16h.
   - **Contact** : 04 93 26 05 38.
   - **Plus d'infos** : [Panasia](https://www.cap3000.com/restaurants/panasia)

2. **Rice Street**
   - **Description** : Concept de street food asiatique avec une ambiance de marché, proposant des mets fusion qui allient authenticité et créativité.
   - **Horaires** : Lundi - Samedi : 11h à 20h30, Dimanche : 11h à 19h.
   - **Contact** : 04 93 26 05 38.
   - **Plus d'infos** : [Rice Street](https://www.cap3000.com/restaurants/ricestreet)

3. **Pokawa**
   - **Description** : Chaîne de restaurants spécialisée dans les Poké Bowls, avec des ingrédients frais et des recettes colorées.
   - **Horaires** : Lundi - Samedi : 10h à 20h, Dimanche : 11h à 19h.
   - **Contact** : 04 93 07 87 62.
   - **Plus d'infos** : [Pokawa](https://www.cap3000.com/restaurants/pokawa)

4. **Sushi Shop**
   - **Description** : Chaîne française de restauration rapide japonaise, avec des sushis à emporter ou en livraison.
   - **Horaires** : Lundi - Dimanche : 11h30 à 19h30.
   - **Contact** : 04 93 07 65 66.
   - **Plus d'infos** : [Sushi Shop](https://www.cap3000.com/restaurants/sushi-shop)
"""

# Convert markdown to HTML
html = markdown.markdown(markdown_text)

# Print the HTML output
print(html)
