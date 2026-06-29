// Script de jeu de départ (domaine Unity). Logique pure testable (Score) séparée du
// MonoBehaviour pour que les tests EditMode tournent sans scène — c'est l'équivalent
// Unity de « build vert ≠ ça marche » : on teste la LOGIQUE, pas seulement la compilation.
using UnityEngine;

namespace Mango
{
    /// <summary>Logique de score PURE (testable hors runtime).</summary>
    public class Score
    {
        public int Value { get; private set; }

        public void Add(int points)
        {
            if (points < 0) return;
            Value += points;
        }

        public void Reset() => Value = 0;
    }

    /// <summary>Contrôleur de jeu minimal accroché à un GameObject de la scène Main.</summary>
    public class GameController : MonoBehaviour
    {
        readonly Score _score = new Score();

        void Start()
        {
            Debug.Log("[Mango] GameController prêt.");
        }

        public int AddPoints(int points)
        {
            _score.Add(points);
            return _score.Value;
        }
    }
}
