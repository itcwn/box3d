# Projektant klocków 6×6×12 cm

Prosta aplikacja webowa pozwalająca projektować modele z klocków o wymiarach 6 × 6 × 12 cm. Interfejs 3D działa w przeglądarce i bazuje na bibliotece [Three.js](https://threejs.org/).

## Funkcje

- Siatka 3D z podglądem położenia klocka (zielony – dostępne, czerwony – niedozwolone).
- Dodawanie klocków kliknięciem w scenę, przy zachowaniu kontaktu z innymi elementami lub podstawą.
- Usuwanie klocka kombinacją <kbd>Shift</kbd> + lewy przycisk myszy.
- Reset sceny jednym przyciskiem.
- Eksport układu do JSON z listą współrzędnych w centymetrach.

## Jak uruchomić

1. Zainstaluj dowolny prosty serwer HTTP (np. `npm install -g serve`).
2. W katalogu repozytorium uruchom serwer, np. `serve .` lub `python3 -m http.server`.
3. Otwórz adres `http://localhost:3000` (lub wskazany przez serwer) w przeglądarce wspierającej WebGL.

> ⚠️ Bezpośrednie otwarcie pliku `index.html` z dysku może nie zadziałać, ponieważ moduły ES6 wymagają serwera HTTP.

## Sterowanie

- Lewy przycisk myszy – dodanie klocka w miejscu, gdzie pojawia się zielony podgląd.
- <kbd>Shift</kbd> + lewy przycisk myszy – usunięcie klocka.
- Przeciąganie z wciśniętym lewym przyciskiem – obracanie widoku (OrbitControls).
- Rolka myszy / pinch – przybliżenie i oddalenie.

## Eksportowane współrzędne

Eksport JSON zawiera tablicę obiektów `{ x, y, z }`, gdzie wartości odpowiadają liczbie klocków od środka siatki (o rozmiarze jednego klocka). Aby uzyskać wartości w centymetrach, należy przemnożyć współrzędne X i Z przez 6, a Y przez 12 (wysokość).
