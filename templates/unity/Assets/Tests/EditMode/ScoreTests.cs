// Tests EditMode de la logique de score (NUnit, lancés par unity_test / domains).
using NUnit.Framework;
using Mango;

namespace Mango.Tests
{
    public class ScoreTests
    {
        [Test]
        public void Add_Accumulates()
        {
            var s = new Score();
            s.Add(3);
            s.Add(5);
            Assert.AreEqual(8, s.Value);
        }

        [Test]
        public void Add_IgnoresNegative()
        {
            var s = new Score();
            s.Add(-10);
            Assert.AreEqual(0, s.Value);
        }

        [Test]
        public void Reset_ZeroesValue()
        {
            var s = new Score();
            s.Add(7);
            s.Reset();
            Assert.AreEqual(0, s.Value);
        }
    }
}
