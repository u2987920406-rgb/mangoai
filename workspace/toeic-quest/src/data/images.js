// ── Pexels image URLs for TOEIC QUEST ──────────────────────────────────────
// Real photos from Pexels, mapped by topic key

export const HERO_IMAGE = "https://images.pexels.com/photos/5324855/pexels-photo-5324855.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

export const TOPIC_IMAGES = {
  // Listening topics
  restaurant: "https://images.pexels.com/photos/32568165/pexels-photo-32568165.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  airport: "https://images.pexels.com/photos/12717154/pexels-photo-12717154.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  office: "https://images.pexels.com/photos/5676679/pexels-photo-5676679.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  weather: "https://images.pexels.com/photos/37098393/pexels-photo-37098393.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  meeting: "https://images.pexels.com/photos/7108454/pexels-photo-7108454.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  phone: "https://images.pexels.com/photos/7222904/pexels-photo-7222904.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  conference: "https://images.pexels.com/photos/9275222/pexels-photo-9275222.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  shopping: "https://images.pexels.com/photos/13425897/pexels-photo-13425897.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  hotel: "https://images.pexels.com/photos/7821349/pexels-photo-7821349.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  training: "https://images.pexels.com/photos/10498800/pexels-photo-10498800.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  // Reading topics
  email: "https://images.pexels.com/photos/7821760/pexels-photo-7821760.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  notice: "https://images.pexels.com/photos/7319291/pexels-photo-7319291.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  report: "https://images.pexels.com/photos/9034223/pexels-photo-9034223.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  job: "https://images.pexels.com/photos/5989931/pexels-photo-5989931.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  memo: "https://images.pexels.com/photos/7841408/pexels-photo-7841408.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  ad: "https://images.pexels.com/photos/17565491/pexels-photo-17565491.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  contract: "https://images.pexels.com/photos/261621/pexels-photo-261621.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  schedule: "https://images.pexels.com/photos/11773871/pexels-photo-11773871.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  newsletter: "https://images.pexels.com/photos/1007027/pexels-photo-1007027.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
  policy: "https://images.pexels.com/photos/7735621/pexels-photo-7735621.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
};

export function getTopicImage(topic) {
  return TOPIC_IMAGES[topic] || HERO_IMAGE;
}