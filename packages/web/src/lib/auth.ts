import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "read:user user:email repo",
        },
      },
      profile(profile) {
        return {
          id: String(profile.id),
          name: profile.name ?? profile.login,
          email: profile.email,
          image: profile.avatar_url,
          githubId: String(profile.id),
        };
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
    async signIn({ user, profile }) {
      if (profile?.id) {
        await prisma.user.update({
          where: { id: user.id! },
          data: { githubId: String(profile.id) },
        }).catch(() => {
          // User may not exist yet on first sign-in (adapter creates after)
        });
      }
      return true;
    },
  },
  events: {
    async createUser({ user }) {
      // Ensure githubId is set on first sign-up
      const account = await prisma.account.findFirst({
        where: { userId: user.id!, provider: "github" },
      });
      if (account) {
        await prisma.user.update({
          where: { id: user.id! },
          data: { githubId: account.providerAccountId },
        });
      }
    },
  },
  pages: {
    signIn: "/login",
  },
});
