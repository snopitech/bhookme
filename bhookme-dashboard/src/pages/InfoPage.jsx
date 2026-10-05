import React, { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';

// Simple content pages linked from the footer.
// NOTE: Terms and Privacy below are plain-language drafts - have a lawyer
// review them before bhookme launches.
const PAGES = {
  'responsible-hosting': {
    title: 'Responsible hosting',
    intro: 'Hosting on bhookme comes with a few simple commitments to your guests and neighbors.',
    sections: [
      ['Be accurate', 'Describe your place or car honestly, with current photos, the real number of guests it fits, and any limitations guests should know about.'],
      ['Keep it safe', 'Provide working smoke and carbon monoxide detectors, a first-aid kit, and clear emergency information. Keep cars maintained, insured and roadworthy.'],
      ['Follow local rules', 'Check your city and state rules on short-term rentals, permits and taxes before you list, and follow them.'],
      ['Respect privacy', 'Disclose any security cameras in common areas. Cameras are never allowed in bedrooms or bathrooms.'],
      ['Communicate', 'Reply to guest messages promptly and keep conversations on bhookme so there is a record if anything goes wrong.'],
    ],
  },
  newsroom: {
    title: 'Newsroom',
    intro: 'News and updates from bhookme.',
    sections: [
      ['bhookme is growing', 'Homes, car rentals and hosted experiences are now all bookable in one place, with more cities and services on the way.'],
      ['Press inquiries', 'For press and media questions, contact us through the Help Center and choose "Something else".'],
    ],
  },
  careers: {
    title: 'Careers',
    intro: "We're building a better way to stay, drive and explore. Want to help?",
    sections: [
      ['Open roles', "We don't have open positions listed right now. Check back soon - new roles will be posted here."],
      ['Get in touch', 'Interested in working with us? Send a note through the Help Center (choose "Something else") with a link to your resume or portfolio.'],
    ],
  },
  terms: {
    title: 'Terms of Service',
    intro: 'These terms explain the rules for using bhookme. By using the site you agree to them.',
    draft: true,
    sections: [
      ['Using bhookme', 'You must be at least 18 to book or host. Keep your account details accurate and your password private. You are responsible for activity on your account.'],
      ['Bookings', 'A booking is an agreement between the guest and the host. Hosts must honor confirmed bookings, and guests must follow the listing rules.'],
      ['Payments', 'Prices, fees and any refund rules are shown before you book. Online payment is being introduced; you will be told clearly before any charge.'],
      ['Content', 'Listings, photos and reviews you post must be honest and must not break the law or infringe anyone else\'s rights. We may remove content that breaks these rules.'],
      ['Changes', 'We may update these terms. If changes are significant, we will let you know before they take effect.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro: 'This explains what information bhookme collects and how we use it.',
    draft: true,
    sections: [
      ['What we collect', 'Account details (name, email, phone), listings and photos you post, bookings, messages, reviews, and basic usage data needed to run the site.'],
      ['How we use it', 'To run bookings, connect guests and hosts, keep accounts secure, send service emails, and improve bhookme. We do not sell your personal information.'],
      ['Who sees it', 'Hosts and guests see what they need to complete a booking. Service providers (such as email and photo storage) process data on our behalf.'],
      ['Your choices', 'You can update your profile, unsubscribe from marketing emails, or ask us to delete your account through the Help Center.'],
      ['Security', 'We use secure connections and extra verification for host accounts. No system is perfect, so please use a strong, unique password.'],
    ],
  },
};

export default function InfoPage() {
  const { slug } = useParams();
  const page = PAGES[slug];

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if (!page) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h1 className="text-2xl font-bold mb-2">Page not found</h1>
        <Link to="/help" className="text-rose-500 font-medium hover:underline">Go to the Help Center</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-2">{page.title}</h1>
      <p className="text-gray-600 mb-8">{page.intro}</p>
      {page.draft && (
        <p className="text-xs text-gray-400 mb-6">Last updated {new Date().getFullYear()}.</p>
      )}
      <div className="space-y-6">
        {page.sections.map(([heading, body]) => (
          <section key={heading}>
            <h2 className="text-lg font-semibold mb-1">{heading}</h2>
            <p className="text-gray-700">{body}</p>
          </section>
        ))}
      </div>
      <div className="mt-10 pt-6 border-t border-gray-200 text-sm text-gray-600">
        Questions? <Link to="/help#contact" className="underline">Contact us</Link>.
      </div>
    </div>
  );
}