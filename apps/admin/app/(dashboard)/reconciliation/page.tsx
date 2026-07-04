import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { ReconciliationTable } from "@/features/reconciliation/components/reconciliation-table"
import { OrphansTable } from "@/features/reconciliation/components/orphans-table"

export default function ReconciliationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-su-sans text-su-title-lg font-semibold text-su-ink">
          Reconciliation Queue
        </h1>
        <p className="font-su-sans text-su-body-sm text-su-muted">
          Exceptions that require manual attention.
        </p>
      </div>

      <Tabs defaultValue="unmatched">
        <TabsList>
          <TabsTrigger value="unmatched">Unmatched webhooks</TabsTrigger>
          <TabsTrigger value="orphans">Orphans (spooled)</TabsTrigger>
        </TabsList>
        <TabsContent value="unmatched" className="mt-4">
          <ReconciliationTable />
        </TabsContent>
        <TabsContent value="orphans" className="mt-4">
          <OrphansTable />
        </TabsContent>
      </Tabs>
    </div>
  )
}
