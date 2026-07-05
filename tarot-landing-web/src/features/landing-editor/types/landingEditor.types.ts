export interface LandingContentSection {
  id: number;
  section: string;
  content: HeroContent | TestimonialContent | FooterContent | AboutContent | PsychicsContent;
}

export interface SocialLink {
  platform: string;
  url: string;
  icon: string;
}

export interface NavLink {
  name: string;
  path: string;
}

export interface FooterContent {
  brandName: string;
  description: string;
  socialLinks: SocialLink[];
  copyright: string;
  navLinks: NavLink[];
}

export interface AboutContent {
  badge: string;
  title: string;
  titleHighlighted: string;
  established: string;
  tagline: string;
  leftTag: string;
  rightTag: string;
  bodyTitle: string;
  bodyContent: string;
  missionTitle: string;
  missionContent: string;
}

export interface PsychicsContent {
  heading: string;
  headingHighlighted: string;
  subtitleLine2: string;
  featuredPsychicIds: number[];
}

export interface HeroContent {
  badge: string;
  headline: string;
  headlineHighlighted: string;
  subtitle: string;
}

export interface TestimonialItem {
  name: string;
  role: string;
  content: string;
}

export interface TestimonialContent {
  testimonials: TestimonialItem[];
}
