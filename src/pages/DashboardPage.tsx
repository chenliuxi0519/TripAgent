import { UserDashboard } from "@/components/user/UserDashboard"

export default function DashboardPage() {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl p-6">
        <UserDashboard />
      </div>
    </div>
  )
}
