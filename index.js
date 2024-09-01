const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const serverless = require('serverless-http');
const app = express()
const port = process.env.PORT || 5000


// middleware
const allowedOrigins = [process.env.FRONTEND_URL, process.env.FRONTEND_URL_PRODUCTION];
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json())

app.options('*', cors({
    origin: allowedOrigins,
    credentials: true
}));



// MongoDB URI and client
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.emnfg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Use a global variable to store the client
let client;
let clientPromise;

if (!global._mongoClientPromise) {
    client = new MongoClient(uri, {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
        }
    });
    global._mongoClientPromise = client.connect();
}
clientPromise = global._mongoClientPromise;


async function run() {
    try {
        
        // Connect the client to the server	(optional starting in v4.7)
        // await clientPromise; 

        const enrollCollection = client.db("globalChainAcademy").collection('enrollments')
        const userCollection = client.db("globalChainAcademy").collection('users')


        app.options('*', (req, res) => {
            res.sendStatus(200);
        });

        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1h'
            })
            res.send({ token })
        })

        const verifyToken = (req, res, next) => {
            const authorizeToken = req.headers.authorization
            // console.log('token', token)

            if (!authorizeToken) {
                return res.status(403).json({
                    message: "No token provided",
                    success: false,
                });
            }

            const token = authorizeToken.split(' ')[1];


            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).json({
                        message: "Unauthorized! Invalid token",
                        success: false,
                    });
                }
                req.decoded = decoded;
                next();
            });
        };



        // Middleware: Verify Admin
        const verifyAdmin = async (req, res, next) => {
            const email = req?.decoded?.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';

            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }


        // Routes
        app.get('/user/admin/:email', verifyToken, async (req, res) => {
            const email = req?.params?.email;

            if (email !== req?.decoded?.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }

            const query = { email: email }
            const user = await userCollection.findOne(query)
            let admin = false

            if (user) {
                admin = user?.role === 'admin'
            }

            res.send({ admin })
        })


        app.get('/user', verifyToken, async (req, res) => {
            const userEmail = req?.query?.email;
            const query = { email: userEmail }

            try {
                const userDetails = await userCollection.findOne(query, { projection: { password: 0 } });
                res.json({
                    message: "User Details",
                    success: true,
                    error: false,
                    data: userDetails,
                });
            } catch (error) {
                res.status(500).json({
                    message: "Error fetching user details",
                    success: false,
                    error: true,
                    data: [],
                });
            }
        })


        app.get('/users', async (req, res) => {
            try {
                const users = await userCollection.find().toArray()
                res.json({
                    message: "all users",
                    success: true,
                    error: false,
                    data: users
                })
            } catch (error) {
                res.status(500).json({
                    message: "Error fetching users",
                    success: false,
                    error: true,
                    data: []
                });
            }
        })

        app.post('/user', async (req, res) => {
            try {
                const user = req?.body;
                const query = { email: user?.email }
                const exitsUser = await userCollection.findOne(query)

                if (exitsUser) {
                    return res.json({
                        message: 'User with this email already exists',
                        insertedId: null
                    })
                }
                const newUser = await userCollection.insertOne(user)
                res.json({
                    message: "Login successful ",
                    success: true,
                    error: false,
                    data: newUser
                })
            } catch (error) {
                console.error("Error in POST /user:", error);
                res.status(500).json({
                    message: "Internal Server Error",
                    success: false,
                    error: true
                });
            }
        })



        app.get('/enrollments', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const enrollments = await enrollCollection.find().toArray()
                res.json({
                    massage: "all enroll courses",
                    success: true,
                    error: false,
                    data: enrollments
                })
            } catch (error) {
                res.status(500).json({
                    message: "Error fetching enrollments",
                    success: false,
                    error: true,
                    data: []
                });
            }
        })


        app.post('/enroll', async (req, res) => {
            try {
                const enrollData = req?.body;
                // console.log(enrollData)
                const query = { email: enrollData.email, course: enrollData.course }
                const existEnroll = await enrollCollection.findOne(query)
                console.log("existEnroll", existEnroll)

                if (existEnroll) {
                    return (
                        res.json({
                            message: "You have already enroll this course!",
                            success: false,
                            error: true,
                            data: existEnroll
                        })
                    )
                }

                const newEnroll = await enrollCollection.insertOne(enrollData)

                res.json({
                    message: "Your Have Enrolled Successfully",
                    success: true,
                    error: false,
                    data: newEnroll
                })

            } catch (error) {
                console.error("Error in POST /enroll:", error);
                res.status(500).json({
                    message: "Internal Server Error",
                    success: false,
                    error: true,
                    data: []
                });
            }
        })


        app.delete('/user/:id', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const userId = req.params.id
                // console.log(userId)
                const query = { _id: new ObjectId(userId) }
                const result = await userCollection.deleteOne(query)

                res.json({
                    message: `User deleted successful`,
                    success: true,
                    error: false,
                    data: result
                })
            } catch (error) {
                console.error("Error deleting user:", error);
                res.status(500).json({
                    message: "Internal Server Error",
                    success: false,
                    error: true
                });
            }
        })

        app.delete('/enrollment/:id', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const id = req.params.id
                // console.log(id)
                const query = { _id: new ObjectId(id) }
                const result = await enrollCollection.deleteOne(query)

                res.json({
                    message: `Deleted successful`,
                    success: true,
                    error: false,
                    data: result
                })
            } catch (error) {
                console.error("Error deleting enrollment:", error);
                res.status(500).json({
                    message: "Internal Server Error",
                    success: false,
                    error: true
                });
            }
        })


        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } catch {
        console.error("Error in run function: ", error);
    }
}
run().catch(console.dir);





app.get('/', (req, res) => {
    res.send("server running")
})

app.listen(port, () => {
    console.log(`server is running on ${port}`)
})


// Export the app wrapped with serverless
module.exports.handler = serverless(app);