const {
  onDocumentUpdated,
  onDocumentCreated,
} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

exports.updateUserInfoInResenas = onDocumentUpdated(
  "usuarios/{userId}",
  async (event) => {
    const userId = event.params.userId;
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    if (beforeData.fotoPerfil === afterData.fotoPerfil) {
      logger.info(
        `No changes in fotoPerfil for user ${userId}. Skipping update.`,
      );
      return;
    }

    logger.info(`Actualizando foto de perfil de: ${userId} en sus reseñas.`);
    const resenasSnapshot = await db
      .collection("resenas")
      .where("usuarioId", "==", userId)
      .get();
    const batch = db.batch();

    resenasSnapshot.forEach((resenaRef) => {
      batch.update(resenaRef.ref, {
        "usuario.fotoPerfil": afterData.fotoPerfil,
      });
    });

    await batch.commit();
    logger.info(
      `Foto de perfil actualizada en ${resenasSnapshot.size} reseñas para el usuario ${userId}.`,
    );
  },
);

exports.sendLikeNotification = onDocumentCreated(
  "resenas/{resenaId}/likes/{likeId}",
  async (event) => {
    const resenaId = event.params.resenaId;
    const likeId = event.params.likeId;

    const resenaDoc = await db.collection("resenas").doc(resenaId).get();
    if (!resenaDoc.exists) {
      logger.warn(`La reseña ${resenaId} no existe`);
      return;
    }
    const resena = resenaDoc.data();
    const autorId = resena.usuarioId;

    if (autorId === likeId) {
      logger.info("Like a su propia reseña, no se envía notificación");
      return;
    }

    const autorDoc = await db.collection("usuarios").doc(autorId).get();
    const fcmToken = autorDoc.data()?.fcmToken;
    if (!fcmToken) {
      logger.warn(`El usuario ${autorId} no tiene fcmToken`);
      return;
    }

    const likerDoc = await db.collection("usuarios").doc(likeId).get();
    const nombreLiker = likerDoc.data()?.nombre ?? "Alguien";
    const nombreCarrera = resena.carrera?.nombre ?? "una carrera";

    const message = {
      token: fcmToken,
      notification: {
        title: "Nuevo like",
        body: `${nombreLiker} le dio like a tu reseña de ${nombreCarrera}`,
      },
    };

    try {
      await admin.messaging().send(message);
      logger.info(`Notificación enviada a ${autorId} por like de ${likeId}`);
    } catch (error) {
      logger.error("Error al enviar la notificación", error);
    }
  },
);
