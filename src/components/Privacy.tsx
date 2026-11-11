import { SiteFooter } from './Home';

/** Put your support email here (for example 'support@yourdomain.com'). When it is set, it shows in the policy. */
const CONTACT_EMAIL = '';
const EFFECTIVE = '11 November 2026';

const POINTS: Array<{ title: string; text: React.ReactNode }> = [
  {
    title: 'What we collect',
    text: 'Only what you enter: your sales, expenses and document details, plus your email address and password if you create an account. We never ask for card numbers or banking passwords.',
  },
  {
    title: 'How we use it',
    text: 'To save and show your records, reports and documents, and to keep your account secure. We do not sell your data and we do not show ads.',
  },
  {
    title: 'Where it is kept',
    text: 'Until you sign in, your records stay in your own browser on your device. When you sign in, they are saved to your private account so you can open them on any device. Each person can see only their own records.',
  },
  {
    title: 'Sharing',
    text: 'We share data only with the services that host KACHIER, when you choose to share a document (for example on WhatsApp), or when the law requires it.',
  },
  {
    title: 'Security',
    text: 'Connections are encrypted and access to stored records is limited to the account owner. No system is completely secure, so please keep your password private.',
  },
  {
    title: 'Your choices',
    text: 'You can edit, export or delete your records at any time. You can also ask us to close your account and delete your data. KACHIER is for adults aged 18 and over.',
  },
];

export function Privacy() {
  return (
    <>
      <main className="legal">
        <div className="container legal-wrap">
          <a className="btn outline sm" href="#/">
            Back to home
          </a>
          <h1>Privacy Policy</h1>
          <p className="muted legal-date">Effective {EFFECTIVE}</p>
          <p className="legal-intro">
            KACHIER helps business owners keep sales, expenses and business documents in one place. Your business records belong to you. This policy explains, in short, how we handle your information in line with the Nigeria Data Protection Act 2023.
          </p>
          {POINTS.map((p) => (
            <section key={p.title} className="legal-sec">
              <h2>{p.title}</h2>
              <p>{p.text}</p>
            </section>
          ))}
          <section className="legal-sec">
            <h2>Contact and updates</h2>
            <p>
              Questions or requests about your data?{' '}
              {CONTACT_EMAIL ? (
                <>
                  Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
                </>
              ) : (
                <>Use the support contact on this website.</>
              )}{' '}
              If we change this policy, we will update the date above.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
