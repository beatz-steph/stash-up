import { CircleDetail } from "@/features/circles/components/circle-detail"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function CircleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="space-y-6">
      <div>
        <Link href="/circles" className="flex items-center text-su-muted hover:text-su-ink text-sm mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Circles
        </Link>
        <h1 className="font-su-sans text-su-title-lg font-semibold text-su-ink">Circle Detail</h1>
      </div>
      <CircleDetail id={id} />
    </div>
  )
}
