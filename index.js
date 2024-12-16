import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import GoogleStrategy from "passport-google-oauth2";
import env from "dotenv";
import nodemailer from "nodemailer";
import flash from "connect-flash";

const app = express();
const PORT = process.env.PORT || 3000;
const saltRounds = 10;
env.config();

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

app.use(flash());

// Make flash messages available to views
app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  next();
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(passport.initialize());
app.use(passport.session());

// Decide on the connection string
const connectionString =
  process.env.INTERNAL_DATABASE_URL || // Use Internal URL on Render
  process.env.DATABASE_URL || // Use External URL as a fallback
  `postgresql://${process.env.PG_USER}:${process.env.PG_PASSWORD}@${process.env.PG_HOST}:${process.env.PG_PORT}/${process.env.PG_DATABASE}`; // Local fallback

// Initialize the database client
const db = new pg.Client({
  connectionString: connectionString,
  ssl:
    process.env.INTERNAL_DATABASE_URL || process.env.DATABASE_URL
      ? { rejectUnauthorized: false }
      : false, // Enable SSL only in production
});

// Connect to the database
db.connect()
  .then(() => console.log("Database connected successfully!"))
  .catch((err) => console.error("Database connection error:", err));

export default db;

// FUNCTION TO PROTECT ENDPOINTS BY ENSURING THAT USER IS LOGGED IN
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/"); // Redirect unauthenticated users to the login page
}

// HELPER FUNCTIONS FOR DATABASE QUERIES

async function getWordClasses() {
  try {
    const { rows } = await db.query("SELECT * FROM word_classes");
    return rows.length ? rows : console.log("No word classes found");
  } catch (err) {
    console.error("Error in getWordClasses:", err);
  }
}

async function getWords() {
  try {
    const { rows } = await db.query("SELECT * FROM words");
    return rows.length ? rows : console.log("No words found");
  } catch (err) {
    console.error("Error in getWords:", err);
  }
}

async function getWord(wordId) {
  try {
    const { rows } = await db.query("SELECT * FROM words WHERE id = $1", [
      wordId,
    ]);
    return rows.length ? rows[0] : console.log("Word not found");
  } catch (err) {
    console.error("Error in getWord:", err);
  }
}

async function getSets() {
  try {
    const { rows } = await db.query("SELECT * FROM sets");
    console.log(rows);
    return rows.length ? rows : console.log("No sets found");
  } catch (err) {
    console.error("Error in getSets:", err);
  }
}

async function getSet(setId) {
  try {
    const { rows } = await db.query("SELECT * FROM sets WHERE id = $1", [
      setId,
    ]);
    return rows.length ? rows[0] : console.log("Set not found");
  } catch (err) {
    console.error("Error in getSet:", err);
  }
}

async function getWordsInSet(setId) {
  try {
    const { rows } = await db.query(
      `
      SELECT 
        w.id AS word_id,
        w.hanzi,
        w.pinyin,
        w.translation,
        w.comment
      FROM 
        words AS w
      JOIN 
        words_sets AS ws ON w.id = ws.word_id
      JOIN 
        sets AS s ON ws.set_id = s.id
      WHERE 
        s.id = $1;
      `,
      [setId] // Use parameterized query to avoid SQL injection
    );
    return rows.length ? rows : console.log("No words found in the set");
  } catch (err) {
    console.error("Error in getWordsInSet:", err);
  }
}

async function addWord(
  hanzi,
  pinyin,
  translation,
  created_id,
  last_modified_id,
  word_class_id,
  comment
) {
  try {
    const result = await db.query(
      `INSERT INTO words (hanzi, pinyin, translation, created_id, last_modified_id, word_class_id, comment)
    VALUES($1, $2, $3, $4, $5, $6, $7)`,
      [
        hanzi,
        pinyin,
        translation,
        created_id,
        last_modified_id,
        word_class_id,
        comment,
      ]
    );
  } catch (err) {
    console.error(`Error in addWord: ${err.message}`);
  }
}

async function updateWord(
  id,
  hanzi,
  pinyin,
  translation,
  last_modified_id,
  word_class_id,
  comment
) {
  try {
    await db.query(
      "UPDATE words SET hanzi=$1, pinyin=$2, translation=$3, last_modified_id=$4, word_class_id=$5, comment=$6 WHERE id=$7",
      [hanzi, pinyin, translation, last_modified_id, word_class_id, comment, id]
    );
  } catch (err) {
    console.error(`Error in updateWord: ${err}`);
  }
}

async function addSet(name, comment) {
  try {
    await db.query(
      `INSERT INTO sets (name, comment)
      VALUES($1, $2)`,
      [name, comment]
    );
  } catch (err) {
    console.error(`Error in addSet: ${err.message}`);
  }
}

async function updateSet(id, name, comment) {
  try {
    await db.query("UPDATE sets SET name= $1, comment = $2 WHERE id=$3", [
      name,
      comment,
      id,
    ]);
  } catch (err) {
    console.error(err);
  }
}

async function deleteSet(id) {
  try {
    await db.query("DELETE FROM words_sets WHERE set_id = $1", [id]);
    await db.query("DELETE FROM sets WHERE id= $1", [id]);
  } catch (err) {
    console.error("Error deleting set", err);
  }
}

async function addWordToSet(wordId, setId) {
  try {
    await db.query(
      `INSERT INTO words_sets (word_id, set_id)
      VALUES($1, $2)`,
      [wordId, setId]
    );
  } catch (err) {
    console.error(`Error in addWordToSet: ${err.message}`);
  }
}

async function deleteWordFromSet(wordId) {
  try {
    await db.query(
      `DELETE FROM words_sets WHERE word_id = $1
`,
      [wordId]
    );
  } catch (err) {
    console.error(`Error in deleteWordFromSet: ${err.message}`);
  }
}

async function getSetIds(wordId) {
  try {
    const { rows } = await db.query(
      `SELECT set_id FROM words_sets WHERE word_id = $1`,
      [wordId]
    );

    return rows.length ? rows : [];
  } catch (err) {
    console.error(`Error in getSetIds: ${err.message}`);
  }
}

async function deleteWordFromDB(wordId) {
  try {
    const setIds = await getSetIds(wordId);
    if (setIds.length > 0) {
      for (let { set_id } of setIds) await deleteWordFromSet(wordId, set_id);
    }
    await db.query(`DELETE FROM words WHERE id = $1`, [wordId]);
  } catch (err) {
    console.error(`Error in deleteWordFromDB: ${err.message}`);
  }
}

async function searchInWords(query) {
  try {
    // Validating input to avoid unnecessary database calls
    if (!query || query.trim() === "") {
      return []; // Returning an empty array if the query is invalid or empty
    }

    // Adding wildcards directly to the parameter for safe SQL injection handling
    const searchPattern = `%${query}%`;

    // Querying all relevant columns: hanzi, pinyin, and translation
    const sql = `
      SELECT * 
      FROM words 
      WHERE hanzi LIKE $1 OR pinyin LIKE $1 OR translation LIKE $1
    `;
    const result = await db.query(sql, [searchPattern]);

    return result.rows;
  } catch (err) {
    console.error(`Error searching for query "${query}":`, err);
    throw err; // Ensuring the calling function knows about the failure
  }
}

// ENDPOINTS: CRUD routes

app.get("/", (req, res) => {
  res.render("start.ejs");
});

app.get("/about", (req, res) => {
  res.render("about.ejs");
});

app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.get("/home", ensureAuthenticated, (req, res) => {
  res.render("home.ejs");
});

app.get("/add-word", ensureAuthenticated, async (req, res) => {
  const wordClasses = await getWordClasses();
  res.render("modify-word.ejs", {
    title: "Add New Word",
    word_classes: wordClasses,
  });
});

app.post("/add-word", ensureAuthenticated, async (req, res) => {
  const { hanzi, pinyin, translation, wordClassId, comment } = req.body;
  const userId = req.user.id; // Get the currently logged-in user's ID

  try {
    await addWord(
      hanzi,
      pinyin,
      translation,
      userId,
      userId,
      wordClassId,
      comment
    );
    res.redirect("/words");
  } catch (err) {
    console.error("Error adding word:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/update-word/:id", ensureAuthenticated, async (req, res) => {
  try {
    const id = req.params.id;
    const word = await getWord(id);
    const word_classes = await getWordClasses();

    res.render("modify-word.ejs", {
      title: "Update Word",
      word,
      word_classes,
    });
  } catch (err) {
    console.error("Error getting update-word:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/update-word/:id", ensureAuthenticated, async (req, res) => {
  const { hanzi, pinyin, translation, wordClassId, comment } = req.body;
  const id = req.params.id;
  const userId = req.user.id;

  try {
    await updateWord(
      id,
      hanzi,
      pinyin,
      translation,
      userId,
      wordClassId,
      comment
    );
    res.redirect("/words");
  } catch (err) {
    console.error("Error updating word:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/delete-word/:id", ensureAuthenticated, async (req, res) => {
  try {
    const id = req.params.id;
    const word = await getWord(id);
    const createdById = word.created_id;
    const userId = req.user.id;
    if (userId === createdById) {
      await deleteWordFromDB(id);
    } else {
      console.log(
        "You are not allowed to delete words that you did not create."
      );
      res
        .status(405)
        .send("You are not allowed to delete words that you did not create.");
    }
    res.redirect("/words");
  } catch (err) {
    console.log("Error deleting word", err);
  }
});

app.get("/words", ensureAuthenticated, async (req, res) => {
  const words = await getWords();
  res.render("words.ejs", { words: words });
});

app.get("/word/:wordId", ensureAuthenticated, async (req, res) => {
  try {
    const wordId = req.params.wordId;
    const setsInDb = await getSets();
    const word = await getWord(wordId);
    if (!word) {
      return res.status(404).send("Word not found");
    }
    const words = await getWord(wordId);
    res.render("word.ejs", {
      word: word,
      hanzi: word.hanzi,
      setsInDb: setsInDb,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/add-set", ensureAuthenticated, (req, res) => {
  res.render("modify-set.ejs", { title: "Add New Set" });
});

app.get("/sets", ensureAuthenticated, async (req, res) => {
  const setsInDb = await getSets();
  console.log(setsInDb);
  res.render("sets.ejs", { sets: setsInDb });
});

app.get("/set/:setId", ensureAuthenticated, async (req, res) => {
  try {
    const wordsInDb = await getWords();
    const setId = req.params.setId;
    const set = await getSet(setId);
    if (!set) {
      return res.status(404).send("Set not found");
    }
    const words = await getWordsInSet(setId);
    res.render("set.ejs", {
      words: words,
      set: set,
      wordsInDb: wordsInDb,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/add-set", ensureAuthenticated, async (req, res) => {
  const name = req.body.name;
  const comment = req.body.comment;
  try {
    await db.query("INSERT INTO sets (name, comment) VALUES ($1, $2)", [
      name,
      comment,
    ]);
    res.redirect("/sets");
  } catch (err) {
    res.send(err);
  }
});

app.get("/update-set/:id", ensureAuthenticated, async (req, res) => {
  const id = req.params.id;
  const set = await getSet(id);
  res.render("modify-set.ejs", {
    title: "Update Title and Comment of Set",
    set,
  });
});

app.post("/update-set/:id", ensureAuthenticated, async (req, res) => {
  const { name, comment } = req.body;
  const id = req.params.id;

  try {
    await updateSet(id, name, comment);
    res.redirect("/sets");
  } catch (err) {
    console.error("Error updating set:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/delete-set/:id", async (req, res) => {
  const id = req.params.id;
  await deleteSet(id);
  res.redirect("/sets");
});

app.post("/add-word-to-set/:wordId/:setId", async (req, res) => {
  const { wordId, setId } = req.params;

  try {
    await addWordToSet(wordId, setId);

    res.redirect(`/set/${setId}`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add word to set" });
  }
});

app.post("/delete-word-from-set/:wordId/:setId", async (req, res) => {
  const { wordId, setId } = req.params;

  try {
    await deleteWordFromDB(wordId, setId);

    res.redirect(`/set/${setId}`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete word from set" });
  }
});

// ENDPOINTS: ROUTES FOR THE CONTACT FORM

app.get("/contact", (req, res) => {
  res.render("contact.ejs");
});

app.post("/contact", async (req, res) => {
  const { email, subject, message } = req.body;

  try {
    // Configure the email transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PW,
      },
    });

    // Define the email options
    const mailOptions = {
      from: email,
      to: "bernhard.scheucher@gmail.com",
      subject: `Message from ${email}: ${subject}`,
      text: message,
    };

    // Send the email
    await transporter.sendMail(mailOptions);
    res.render("success.ejs", { email, subject });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).send("Something went wrong. Please try again later.");
  }
});

// ENPOINTS: ROUTES FOR THE SEARCH FUNCTION
app.get("/search-words", ensureAuthenticated, (req, res) => {
  const words = [];
  res.render("search-words.ejs", { words });
});

app.post("/search-words", ensureAuthenticated, async (req, res) => {
  const query = req.body.wordQuery;
  const words = await searchInWords(query);
  res.render("search-words.ejs", { words });
});

// ENDPOINTS: PRACTICE HANZI, PINYIN, TRANSLATION

app.get("/practice-hanzi/:setId", ensureAuthenticated, async (req, res) => {
  try {
    const setId = req.params.setId;

    const wordsQuery = `
      SELECT w.id, w.hanzi, w.pinyin, w.translation 
      FROM words w
      JOIN words_sets ws ON w.id = ws.word_id
      WHERE ws.set_id = $1;
    `;
    const { rows: words } = await db.query(wordsQuery, [setId]);

    if (words.length === 0) {
      req.flash("error", "No words available in this set.");
      return res.redirect("/sets");
    }

    res.render("practice-hanzi.ejs", {
      setId,
      words,
      success: req.flash("success"),
      error: req.flash("error"),
    });
  } catch (error) {
    console.error("Error loading words:", error);
    res.status(500).send("Server Error");
  }
});

app.get("/practice-pinyin/:setId", ensureAuthenticated, async (req, res) => {
  try {
    const setId = req.params.setId;

    const wordsQuery = `
      SELECT w.id, w.hanzi, w.pinyin, w.translation 
      FROM words w
      JOIN words_sets ws ON w.id = ws.word_id
      WHERE ws.set_id = $1;
    `;
    const { rows: words } = await db.query(wordsQuery, [setId]);

    if (words.length === 0) {
      req.flash("error", "No words available in this set.");
      return res.redirect("/sets");
    }

    res.render("practice-pinyin.ejs", {
      setId,
      words,
      success: req.flash("success"),
      error: req.flash("error"),
    });
  } catch (error) {
    console.error("Error loading words:", error);
    res.status(500).send("Server Error");
  }
});

app.get(
  "/practice-translation/:setId",
  ensureAuthenticated,
  async (req, res) => {
    try {
      const setId = req.params.setId;

      const wordsQuery = `
      SELECT w.id, w.hanzi, w.pinyin, w.translation 
      FROM words w
      JOIN words_sets ws ON w.id = ws.word_id
      WHERE ws.set_id = $1;
    `;
      const { rows: words } = await db.query(wordsQuery, [setId]);

      if (words.length === 0) {
        req.flash("error", "No words available in this set.");
        return res.redirect("/sets");
      }

      res.render("practice-translation.ejs", {
        setId,
        words,
        success: req.flash("success"),
        error: req.flash("error"),
      });
    } catch (error) {
      console.error("Error loading words:", error);
      res.status(500).send("Server Error");
    }
  }
);

// ENDPOINTS: LOGIN AND REGISTER ROUTES

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/home",
    failureRedirect: "/",
  })
);

app.post("/register", async (req, res) => {
  const { username, firstName, lastName, email, password } = req.body;

  try {
    const checkResult = await db.query(
      "SELECT * FROM users WHERE user_name = $1",
      [username]
    );

    if (checkResult.rows.length > 0) {
      return res.redirect("/"); // User already exists
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const result = await db.query(
      "INSERT INTO users (user_name, first_name, last_name, email, password) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [username, firstName, lastName, email, hashedPassword]
    );

    const user = result.rows[0];
    req.login(user, (err) => {
      if (err) {
        console.error("Error logging in:", err);
        return res.redirect("/");
      }
      res.redirect("/home");
    });
  } catch (err) {
    console.error(err);
    res.redirect("/");
  }
});

app.get("/logout", (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

// PASSPORT AUTHENTICATION

passport.use(
  new Strategy(async function verify(username, password, cb) {
    try {
      const result = await db.query(
        "SELECT * FROM users WHERE user_name = $1",
        [username]
      );
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storedHashedPassword = user.password;
        bcrypt.compare(password, storedHashedPassword, (err, valid) => {
          if (err) {
            console.error("Error comparing passwords:", err);
            return cb(err);
          } else {
            if (valid) {
              return cb(null, user);
            } else {
              return cb(null, false, { message: "Incorrect password." });
            }
          }
        });
      } else {
        return cb(null, false, { message: "User not found." });
      }
    } catch (err) {
      console.log(err);
      return cb(err);
    }
  })
);

passport.serializeUser((user, cb) => {
  cb(null, user.id); // Save only the user ID
});

passport.deserializeUser(async (id, cb) => {
  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    const user = result.rows[0];
    cb(null, user); // Attach the user object to req.user
  } catch (err) {
    cb(err);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
