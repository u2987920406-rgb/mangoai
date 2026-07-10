// ── Pexels image URLs for TOEIC QUEST ──────────────────────────────────────
// Real photos from Pexels, mapped by topic key

export const HERO_IMAGE = "/assets/pexels/5324855.jpeg";

export const TOPIC_IMAGES = {
  // Listening topics
  restaurant: "/assets/pexels/32568165.jpeg",
  airport: "/assets/pexels/12717154.jpeg",
  office: "/assets/pexels/5676679.jpeg",
  weather: "/assets/pexels/37098393.jpeg",
  meeting: "/assets/pexels/7108454.jpeg",
  phone: "/assets/pexels/7222904.jpeg",
  conference: "/assets/pexels/9275222.jpeg",
  shopping: "/assets/pexels/13425897.jpeg",
  hotel: "/assets/pexels/7821349.jpeg",
  training: "/assets/pexels/10498800.jpeg",
  // Reading topics
  email: "/assets/pexels/7821760.jpeg",
  notice: "/assets/pexels/7319291.jpeg",
  report: "/assets/pexels/9034223.jpeg",
  job: "/assets/pexels/5989931.jpeg",
  memo: "/assets/pexels/7841408.jpeg",
  ad: "/assets/pexels/17565491.jpeg",
  contract: "/assets/pexels/261621.jpeg",
  schedule: "/assets/pexels/11773871.jpeg",
  newsletter: "/assets/pexels/1007027.jpeg",
  policy: "/assets/pexels/7735621.jpeg",
};

export function getTopicImage(topic) {
  return TOPIC_IMAGES[topic] || HERO_IMAGE;
}