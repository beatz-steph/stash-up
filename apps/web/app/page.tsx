import Link from "next/link"
import Image from "next/image"
import { headers } from "next/headers"
import { ArrowRight, ShieldCheck, Users, Repeat, Wallet, Landmark, Bell } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { auth } from "@/lib/auth"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Save together, get paid in turns",
  description:
    "StashUp is a digital Ajo/Esusu — join a trusted savings circle, contribute each cycle, and take your payout when it's your turn. Bank-grade rails, automatic reconciliation, real payouts.",
  alternates: { canonical: "/" },
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Users
  title: string
  body: string
}) {
  return (
    <div className="rounded-su-xl border border-su-hairline bg-su-surface-card p-su-lg">
      <span className="flex h-10 w-10 items-center justify-center rounded-su-full bg-su-primary/10 text-su-primary">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 font-su-sans text-su-title-sm font-semibold text-su-ink">{title}</h3>
      <p className="mt-1.5 font-su-sans text-su-body-sm text-su-muted">{body}</p>
    </div>
  )
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="flex gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-su-full bg-su-primary font-su-mono text-su-body-sm font-semibold text-su-on-primary">
        {n}
      </span>
      <div>
        <h3 className="font-su-sans text-su-body font-semibold text-su-ink">{title}</h3>
        <p className="mt-1 font-su-sans text-su-body-sm text-su-muted">{body}</p>
      </div>
    </div>
  )
}

export default async function LandingPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  const signedIn = !!session?.user

  const primaryHref = signedIn ? "/dashboard" : "/sign-up"
  const primaryLabel = signedIn ? "Go to dashboard" : "Get started"

  return (
    <div className="min-h-screen bg-su-canvas">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-su-lg py-5">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.svg" alt="StashUp" width={28} height={28} className="h-7 w-7" />
          <span className="font-su-display text-su-title-md font-semibold tracking-tight text-su-ink">
            StashUp
          </span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-3">
          {signedIn ? (
            <Button asChild className="rounded-su-pill">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" className="rounded-su-pill">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild className="rounded-su-pill">
                <Link href="/sign-up">Get started</Link>
              </Button>
            </>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-su-lg pb-16 pt-10 sm:pt-16">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-su-pill border border-su-hairline bg-su-surface-card px-3 py-1 font-su-sans text-su-caption font-medium text-su-muted">
            <Repeat className="h-3.5 w-3.5 text-su-primary" />
            Ajo · Esusu · rotating savings, reinvented
          </span>
          <h1 className="mt-5 font-su-display text-su-display-md font-bold tracking-tight text-su-ink sm:text-su-display-lg">
            Save together. Get paid in turns.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl font-su-sans text-su-body text-su-muted sm:text-su-title-sm">
            Join a trusted savings circle, contribute each cycle, and collect the full pot when it&apos;s
            your turn. StashUp runs the whole rotation on bank-grade rails — contributions,
            reconciliation, and real payouts, automatically.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="rounded-su-pill">
              <Link href={primaryHref}>
                {primaryLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            {!signedIn && (
              <Button asChild size="lg" variant="outline" className="rounded-su-pill">
                <Link href="/sign-in">I already have an account</Link>
              </Button>
            )}
          </div>
          <p className="mt-4 font-su-sans text-su-caption text-su-muted">
            <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-su-primary" />
            Real money, real payouts — powered by Nomba virtual accounts and transfers.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-su-lg py-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Feature
            icon={Users}
            title="Trusted circles"
            body="Create or join a circle with people you trust. Everyone contributes the same amount each cycle."
          />
          <Feature
            icon={Wallet}
            title="Flexible funding"
            body="Fund by bank transfer to your dedicated account, from your wallet, or by card — your choice."
          />
          <Feature
            icon={Repeat}
            title="Automatic rotation"
            body="Each cycle the pot rotates to the next member. Payouts go straight to their bank."
          />
          <Feature
            icon={Landmark}
            title="Bank-grade rails"
            body="Virtual accounts, transfers, and webhook reconciliation keep every naira accounted for."
          />
          <Feature
            icon={Bell}
            title="Always in the loop"
            body="Get notified the moment a contribution lands, a payout is sent, or it's your turn."
          />
          <Feature
            icon={ShieldCheck}
            title="Reconciled nightly"
            body="Automated reconciliation compares every transaction against the ledger so nothing slips."
          />
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-su-lg py-16">
        <div className="rounded-su-xl border border-su-hairline bg-su-surface-card p-su-lg sm:p-10">
          <h2 className="text-center font-su-display text-su-title-lg font-semibold tracking-tight text-su-ink">
            How StashUp works
          </h2>
          <div className="mx-auto mt-8 grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-3">
            <Step
              n={1}
              title="Start or join a circle"
              body="Set the contribution amount, cycle length, and members — or accept an invite to one."
            />
            <Step
              n={2}
              title="Contribute each cycle"
              body="Pay in by transfer, wallet, or card. StashUp matches and reconciles every payment."
            />
            <Step
              n={3}
              title="Collect your payout"
              body="When it's your turn, the full pot is transferred to your bank — no chasing, no spreadsheets."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      {!signedIn && (
        <section className="mx-auto max-w-6xl px-su-lg pb-16">
          <div className="flex flex-col items-center gap-4 rounded-su-xl bg-gradient-to-br from-su-primary/10 to-transparent p-10 text-center">
            <h2 className="font-su-display text-su-title-lg font-semibold tracking-tight text-su-ink">
              Ready to start saving together?
            </h2>
            <p className="max-w-md font-su-sans text-su-body-sm text-su-muted">
              Create your first circle in minutes. It&apos;s free to start.
            </p>
            <Button asChild size="lg" className="rounded-su-pill">
              <Link href="/sign-up">
                Get started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-su-hairline-soft">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-su-lg py-8 sm:flex-row">
          <div className="flex items-center gap-2">
            <Image src="/logo.svg" alt="StashUp" width={20} height={20} className="h-5 w-5" />
            <span className="font-su-sans text-su-caption text-su-muted">
              © {new Date().getFullYear()} StashUp. Real money, handled with care.
            </span>
          </div>
          <nav className="flex items-center gap-5 font-su-sans text-su-caption text-su-muted">
            <Link href="/terms" className="hover:text-su-ink">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-su-ink">
              Privacy
            </Link>
            <Link href="/sign-in" className="hover:text-su-ink">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
