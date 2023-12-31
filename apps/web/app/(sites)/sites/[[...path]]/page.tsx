import { desc, eq } from "drizzle-orm"
import { Metadata, ResolvingMetadata } from "next"
import { notFound } from "next/navigation"
import React from "react"

import { ComponentNode } from "@/core/lang/codeTree"
import { Interpreter } from "@/core/lang/interpreter"
import { db, schema } from "@/db/index"
import { MainModule } from "@/db/schema"

import { ClientComp } from "./ClientComp"

export type SitePageProps = {
  params: { path: string[] }
  searchParams: { [key: string]: string | string[] | undefined }
  isDevSite?: boolean
}

export async function generateMetadata(
  { params, searchParams }: SitePageProps,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const path = params.path

  const appId = path[0]!

  const app = await db.query.apps.findFirst({
    where: eq(schema.apps.id, appId),
  })

  if (!app) {
    return {
      title: "Not found",
    }
  }

  return {
    title: app.name,
    description: "Awesome app!",
  }
}

export async function SitePage({ params, searchParams, isDevSite }: SitePageProps) {
  console.log("SitePage", params, searchParams)

  const path = params.path

  const appId = path[0]!

  const app = await db.query.apps.findFirst({
    where: eq(schema.apps.id, appId),
  })

  if (!app) {
    return notFound()
  }

  return <ClientComp mainModule={app.mainModule} theme={app.theme} isDevSite={isDevSite ?? false} />
}

export default SitePage

/*
  Server components support, disabled for now
*/
// async function serverComponentRenderer({ mainModule }: { mainModule: MainModule | null }) {
//   if (!mainModule) {
//     return <></>
//   }

//   const code: ComponentNode = mainModule.code

//   const interpreter = new Interpreter()

//   interpreter.setReactMode("server")

//   return interpreter.interpretComponent(code) as any
// }
